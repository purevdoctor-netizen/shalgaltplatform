/**
 * Dexie (IndexedDB) — офлайн хадгалалт.
 *
 * Хүснэгт: exams, questions, submissions, drafts, reports,
 *          emailQueue, qrChunks, syncLog, settings
 */

import Dexie, { type Table } from 'dexie';
import type {
  AnswerValue,
  EmailQueueItem,
  Exam,
  ExamMode,
  Question,
  ReportStats,
  Submission,
  SyncStatus,
} from '@shalgalt/shared';

// ---------------------------------------------------------------------------
// Хүснэгтийн төрлүүд
// ---------------------------------------------------------------------------

/** Багшийн энэ төхөөрөмж дээр хадгалагдсан шалгалт (токентой). */
export interface LocalExam extends Exam {
  /** Багш өөрөө үүсгэсэн эсэх — "Миний шалгалтууд" жагсаалтад харуулна. */
  ownedByMe: boolean;
  /** offlineQr горимд зөв хариултыг тайлах түлхүүр. */
  secretKey?: string;
  syncStatus: SyncStatus;
  savedAt: string;
}

/** Асуултыг тусад нь хадгална (том шалгалтад хайлт хурдан болно). */
export interface LocalQuestion extends Question {
  savedAt: string;
}

/** Хадгалагдсан илгээлт (өөрийн болон цуглуулсан). */
export interface LocalSubmission extends Submission {
  savedAt: string;
  /** Серверт хүлээн зөвшөөрөгдсөн эсэх (sync engine шинэчилнэ). */
  serverId?: string;
  lastError?: string;
}

/** Дуусаагүй шалгалтын түр төлөв. */
export interface LocalDraft {
  id: string;
  examId: string;
  mode: ExamMode;
  studentKey: string;
  lastName: string;
  firstName: string;
  className: string;
  answers: Record<string, AnswerValue>;
  /** Асуултын дараалал (холисон бол) */
  questionOrder: string[];
  startedAt: string;
  updatedAt: string;
  currentIndex: number;
}

export interface LocalReport {
  id: string;
  examId: string;
  generatedAt: string;
  stats: ReportStats;
  docxBlob?: Blob;
  serverId?: string;
  emailStatus: 'pending' | 'sent' | 'failed';
  emailError?: string;
  emailSentAt?: string;
}

export interface LocalEmailQueueItem extends EmailQueueItem {
  /** Тайлангийн локал id (`LocalReport.id`) */
  localReportId: string;
}

/** offlineQr горимд хэсэгчилсэн QR-ыг хуримтлуулах. */
export interface LocalQrChunk {
  /** `${chunkId}:${index}` */
  key: string;
  chunkId: string;
  index: number;
  total: number;
  data: string;
  receivedAt: string;
}

export interface LocalSyncLog {
  id?: number;
  at: string;
  kind: 'submission' | 'report' | 'email' | 'heartbeat';
  status: 'ok' | 'duplicate' | 'error';
  message?: string;
  entityId?: string;
}

export interface LocalSetting {
  key: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Dexie
// ---------------------------------------------------------------------------

export class ShalgaltDatabase extends Dexie {
  exams!: Table<LocalExam, string>;
  questions!: Table<LocalQuestion, string>;
  submissions!: Table<LocalSubmission, string>;
  drafts!: Table<LocalDraft, string>;
  reports!: Table<LocalReport, string>;
  emailQueue!: Table<LocalEmailQueueItem, string>;
  qrChunks!: Table<LocalQrChunk, string>;
  syncLog!: Table<LocalSyncLog, number>;
  settings!: Table<LocalSetting, string>;

  constructor() {
    super('shalgalt');

    this.version(1).stores({
      exams: 'id, ownedByMe, mode, status, deliveryMode, savedAt',
      questions: 'id, examId, order',
      submissions:
        'id, examId, mode, studentKey, syncStatus, [examId+mode], [examId+mode+studentKey]',
      drafts: 'id, examId, [examId+mode+studentKey]',
      reports: 'id, examId, generatedAt, emailStatus',
      emailQueue: 'id, examId, localReportId, status, createdAt',
      qrChunks: 'key, chunkId, [chunkId+index]',
      syncLog: '++id, at, kind, status',
      settings: 'key',
    });
  }
}

export const db = new ShalgaltDatabase();

// ---------------------------------------------------------------------------
// Тохиргоо (settings) — жижиг түлхүүр/утга сан
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------------------
// Шалгалт хадгалах / унших
// ---------------------------------------------------------------------------

export async function saveExamLocally(
  exam: Exam,
  options: { ownedByMe?: boolean; secretKey?: string } = {},
): Promise<void> {
  const savedAt = new Date().toISOString();

  const existing = await db.exams.get(exam.id);
  const existingQuestions = existing
    ? await db.questions.where('examId').equals(exam.id).toArray()
    : [];
  const existingById = new Map(existingQuestions.map((question) => [question.id, question]));
  const questions = exam.questions.map((question) => {
    const previous = existingById.get(question.id);
    if (!previous) return question;
    return {
      ...question,
      ...(question.correctOptionIds === undefined && previous.correctOptionIds !== undefined
        ? { correctOptionIds: previous.correctOptionIds }
        : {}),
      ...(question.acceptedAnswers === undefined && previous.acceptedAnswers !== undefined
        ? { acceptedAnswers: previous.acceptedAnswers }
        : {}),
    };
  });
  const incomingToken = exam.teacherToken?.trim();
  const existingToken = existing?.teacherToken?.trim();
  const local: LocalExam = {
    ...exam,
    teacherToken:
      incomingToken && incomingToken !== 'undefined' && incomingToken !== 'null'
        ? incomingToken
        : existingToken && existingToken !== 'undefined' && existingToken !== 'null'
          ? existingToken
          : '',
    ownedByMe: options.ownedByMe ?? existing?.ownedByMe ?? false,
    syncStatus: 'synced',
    savedAt,
  };
  const secretKey = options.secretKey ?? existing?.secretKey;
  if (secretKey !== undefined) local.secretKey = secretKey;

  await db.transaction('rw', db.exams, db.questions, async () => {
    await db.exams.put(local);
    await db.questions.where('examId').equals(exam.id).delete();
    await db.questions.bulkPut(questions.map((question) => ({ ...question, savedAt })));
  });
}

export async function getExamLocally(examId: string): Promise<LocalExam | undefined> {
  const exam = await db.exams.get(examId);
  if (!exam) return undefined;
  const questions = await db.questions.where('examId').equals(examId).sortBy('order');
  return { ...exam, questions };
}

export async function deleteExamLocally(examId: string): Promise<void> {
  await db.transaction('rw', db.exams, db.questions, db.submissions, async () => {
    await db.exams.delete(examId);
    await db.questions.where('examId').equals(examId).delete();
    await db.submissions.where('examId').equals(examId).delete();
  });
}

export async function listMyExams(): Promise<LocalExam[]> {
  const rows = await db.exams.filter((exam) => exam.ownedByMe).toArray();
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// ---------------------------------------------------------------------------
// Илгээлт
// ---------------------------------------------------------------------------

export async function saveSubmissionLocally(
  submission: Submission,
  syncStatus: SyncStatus = 'pending',
): Promise<void> {
  await db.submissions.put({
    ...submission,
    syncStatus,
    savedAt: new Date().toISOString(),
  });
}

export async function findLocalSubmission(
  examId: string,
  mode: ExamMode,
  studentKey: string,
): Promise<LocalSubmission | undefined> {
  return db.submissions
    .where('[examId+mode+studentKey]')
    .equals([examId, mode, studentKey])
    .first();
}

export async function listLocalSubmissions(
  examId: string,
  mode?: ExamMode,
): Promise<LocalSubmission[]> {
  if (mode) {
    return db.submissions.where('[examId+mode]').equals([examId, mode]).toArray();
  }
  return db.submissions.where('examId').equals(examId).toArray();
}

export async function countPendingSync(): Promise<number> {
  const submissions = await db.submissions.where('syncStatus').equals('pending').count();
  const emails = await db.emailQueue.where('status').equals('pending').count();
  return submissions + emails;
}

// ---------------------------------------------------------------------------
// Ноорог (дуусаагүй шалгалт)
// ---------------------------------------------------------------------------

export function draftId(examId: string, mode: ExamMode, studentKey: string): string {
  return `${examId}:${mode}:${studentKey}`;
}

export async function saveDraft(draft: LocalDraft): Promise<void> {
  await db.drafts.put({ ...draft, updatedAt: new Date().toISOString() });
}

export async function getDraft(
  examId: string,
  mode: ExamMode,
  studentKey: string,
): Promise<LocalDraft | undefined> {
  return db.drafts.get(draftId(examId, mode, studentKey));
}

export async function deleteDraft(
  examId: string,
  mode: ExamMode,
  studentKey: string,
): Promise<void> {
  await db.drafts.delete(draftId(examId, mode, studentKey));
}

// ---------------------------------------------------------------------------
// QR хэсгүүд
// ---------------------------------------------------------------------------

export async function saveQrChunk(chunk: {
  chunkId: string;
  index: number;
  total: number;
  data: string;
}): Promise<void> {
  await db.qrChunks.put({
    key: `${chunk.chunkId}:${chunk.index}`,
    chunkId: chunk.chunkId,
    index: chunk.index,
    total: chunk.total,
    data: chunk.data,
    receivedAt: new Date().toISOString(),
  });
}

export async function listQrChunks(chunkId: string): Promise<LocalQrChunk[]> {
  const rows = await db.qrChunks.where('chunkId').equals(chunkId).toArray();
  return rows.sort((a, b) => a.index - b.index);
}

export async function clearQrChunks(chunkId: string): Promise<void> {
  await db.qrChunks.where('chunkId').equals(chunkId).delete();
}

// ---------------------------------------------------------------------------
// Бүртгэл
// ---------------------------------------------------------------------------

export async function logSync(entry: Omit<LocalSyncLog, 'id' | 'at'>): Promise<void> {
  await db.syncLog.add({ ...entry, at: new Date().toISOString() });
  // Хэт олон бичлэг хуримтлагдахаас сэргийлнэ
  const count = await db.syncLog.count();
  if (count > 500) {
    const oldest = await db.syncLog
      .orderBy('id')
      .limit(count - 500)
      .primaryKeys();
    await db.syncLog.bulkDelete(oldest);
  }
}

/** Тухайн шалгалтын дүрснийг бүхэлд нь дэлгэцээс арилгах. */
export async function forgetExam(examId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.exams, db.questions, db.submissions, db.drafts, db.reports, db.emailQueue],
    async () => {
      await db.exams.delete(examId);
      await db.questions.where('examId').equals(examId).delete();
      await db.submissions.where('examId').equals(examId).delete();
      await db.drafts.where('examId').equals(examId).delete();
      await db.reports.where('examId').equals(examId).delete();
      await db.emailQueue.where('examId').equals(examId).delete();
    },
  );
}
