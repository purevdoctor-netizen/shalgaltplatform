/**
 * Sync engine.
 *
 * Триггер:
 *   • браузерын `online` эвент
 *   • 30 секунд тутам `GET /api/health` heartbeat
 *   • гараар дарсан "Sync" товч
 *
 * Илгээх дараалал: илгээлт (батчаар ≤100) → тайлан → имэйл.
 */

import { config } from '../config';
import { api, ApiError } from '../lib/api';
import { chunkArray } from '../lib/utils';
import { getDeviceId } from '../db/device';
import { db, logSync } from '../db';

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatusSnapshot {
  online: boolean;
  state: SyncState;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

type Listener = (snapshot: SyncStatusSnapshot) => void;

const BATCH_SIZE = 100;

class SyncEngine {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private started = false;

  private snapshot: SyncStatusSnapshot = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    state: 'idle',
    pending: 0,
    lastSyncAt: null,
    lastError: null,
  };

  // -------------------------------------------------------------------------
  // Амьдралын мөчлөг
  // -------------------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    this.timer = setInterval(() => {
      void this.heartbeat();
    }, config.syncIntervalMs);

    void this.refreshPending();
    void this.heartbeat();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SyncStatusSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<SyncStatusSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private handleOnline = (): void => {
    this.emit({ online: true });
    void this.syncNow();
  };

  private handleOffline = (): void => {
    this.emit({ online: false });
  };

  // -------------------------------------------------------------------------
  // Heartbeat — сервер хүрэлцээтэй эсэхийг шалгаж, шаардвал sync хийнэ
  // -------------------------------------------------------------------------

  private async heartbeat(): Promise<void> {
    try {
      await api.health();
      if (!this.snapshot.online) this.emit({ online: true });
      await this.refreshPending();
      if (this.snapshot.pending > 0) await this.syncNow();
    } catch {
      if (this.snapshot.online) this.emit({ online: false });
    }
  }

  async refreshPending(): Promise<number> {
    const submissions = await db.submissions.where('syncStatus').equals('pending').count();
    const emails = await db.emailQueue.where('status').equals('pending').count();
    const pending = submissions + emails;
    this.emit({ pending });
    return pending;
  }

  // -------------------------------------------------------------------------
  // Гол sync
  // -------------------------------------------------------------------------

  async syncNow(): Promise<SyncStatusSnapshot> {
    if (this.running) return this.snapshot;
    this.running = true;
    this.emit({ state: 'syncing', lastError: null });

    try {
      await this.pushSubmissions();
      await this.pushReports();
      await this.pushEmails();

      await this.refreshPending();
      this.emit({
        state: 'idle',
        online: true,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const offline = error instanceof ApiError && error.isOffline;
      this.emit({ state: offline ? 'idle' : 'error', online: !offline, lastError: message });
      await logSync({ kind: 'heartbeat', status: 'error', message });
    } finally {
      this.running = false;
    }

    return this.snapshot;
  }

  // -------------------------------------------------------------------------
  // 1. Илгээлт
  // -------------------------------------------------------------------------

  private async pushSubmissions(): Promise<void> {
    const pending = await db.submissions.where('syncStatus').equals('pending').toArray();
    if (pending.length === 0) return;

    const deviceId = await getDeviceId();

    for (const batch of chunkArray(pending, BATCH_SIZE)) {
      const records = batch.map((submission) => ({
        id: submission.id,
        entity: 'submission' as const,
        examId: submission.examId,
        payload: {
          id: submission.id,
          mode: submission.mode,
          lastName: submission.lastName,
          firstName: submission.firstName,
          className: submission.className,
          studentKey: submission.studentKey,
          answers: submission.answers,
          startedAt: submission.startedAt,
          submittedAt: submission.submittedAt,
          durationSec: submission.durationSec,
          deviceId: submission.deviceId,
          source: submission.source,
        },
      }));

      const response = await api.sync({ deviceId, records });

      for (const result of response.results) {
        if (result.status === 'ok' || result.status === 'duplicate') {
          await db.submissions.update(result.id, {
            syncStatus: result.status === 'ok' ? 'synced' : 'conflict',
          });
        } else {
          await db.submissions.update(result.id, { lastError: result.message ?? 'error' });
        }
        await logSync({
          kind: 'submission',
          status: result.status,
          entityId: result.id,
          ...(result.message !== undefined ? { message: result.message } : {}),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Тайлан (.docx серверт байршуулах)
  // -------------------------------------------------------------------------

  private async pushReports(): Promise<void> {
    const reports = await db.reports.filter((report) => report.serverId === undefined).toArray();
    if (reports.length === 0) return;

    for (const report of reports) {
      const exam = await db.exams.get(report.examId);
      if (!exam?.teacherToken) continue;

      try {
        const response = await api.uploadReport(
          report.examId,
          exam.teacherToken,
          report.stats,
          report.docxBlob,
        );
        await db.reports.update(report.id, { serverId: response.report.id });
        await logSync({ kind: 'report', status: 'ok', entityId: report.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logSync({ kind: 'report', status: 'error', entityId: report.id, message });
        if (error instanceof ApiError && error.isOffline) throw error;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Имэйл дараалал
  // -------------------------------------------------------------------------

  private async pushEmails(): Promise<void> {
    const queue = await db.emailQueue.where('status').equals('pending').toArray();
    if (queue.length === 0) return;

    for (const item of queue) {
      const report = await db.reports.get(item.localReportId);
      const exam = await db.exams.get(item.examId);
      if (!report || !exam?.teacherToken) {
        await db.emailQueue.update(item.id, {
          status: 'failed',
          lastError: 'Тайлан эсвэл багшийн токен олдсонгүй.',
        });
        continue;
      }

      // Тайлан серверт байрлаагүй бол эхлээд байршуулна
      let serverReportId = report.serverId;
      if (!serverReportId) {
        try {
          const uploaded = await api.uploadReport(
            report.examId,
            exam.teacherToken,
            report.stats,
            report.docxBlob,
          );
          serverReportId = uploaded.report.id;
          await db.reports.update(report.id, { serverId: serverReportId });
        } catch (error) {
          if (error instanceof ApiError && error.isOffline) throw error;
          const message = error instanceof Error ? error.message : String(error);
          await db.emailQueue.update(item.id, {
            attempts: item.attempts + 1,
            lastError: message,
          });
          continue;
        }
      }

      try {
        const response = await api.sendReportEmail(serverReportId, exam.teacherToken);
        const sent = response.email.status === 'sent';
        const sentAt = new Date().toISOString();

        await db.emailQueue.update(item.id, {
          status: sent ? 'sent' : 'failed',
          attempts: item.attempts + 1,
          ...(response.email.error !== undefined ? { lastError: response.email.error } : {}),
        });
        await db.reports.update(report.id, {
          emailStatus: sent ? 'sent' : 'failed',
          ...(sent ? { emailSentAt: sentAt } : {}),
          ...(response.email.error !== undefined ? { emailError: response.email.error } : {}),
        });
        await logSync({ kind: 'email', status: sent ? 'ok' : 'error', entityId: item.id });
      } catch (error) {
        if (error instanceof ApiError && error.isOffline) throw error;
        const message = error instanceof Error ? error.message : String(error);
        await db.emailQueue.update(item.id, {
          attempts: item.attempts + 1,
          lastError: message,
          ...(item.attempts + 1 >= 5 ? { status: 'failed' as const } : {}),
        });
        await db.reports.update(report.id, { emailStatus: 'failed', emailError: message });
      }
    }
  }
}

export const syncEngine = new SyncEngine();
