/**
 * Багц sync — офлайн үед хуримтлагдсан бичлэгийг серверт нийлүүлнэ.
 *
 * Conflict дүрэм: `(examId, mode, studentKey)` давтагдвал СЕРВЕР дээр
 * хадгалагдсан ЭХНИЙХ нь үлдэнэ. Хожуу ирсэн нь тусад нь `conflict`
 * төлөвтэй хадгалагдаж, багшийн самбарт "давхардсан хариулт" жагсаалтад
 * харагдана (устгах боломжтой).
 */

import type { PrismaClient } from '@prisma/client';
import { computeStudentKey, scoreAnswers } from '@shalgalt/shared';
import { newId } from '../lib/ids';
import { toExam } from '../lib/mappers';
import { saveSubmission } from './submissionService';
import type { SyncBatchInput } from '../schemas';

export interface SyncRecordResult {
  id: string;
  status: 'ok' | 'duplicate' | 'error';
  message?: string;
  /** Серверт үүссэн/олдсон бичлэгийн id */
  serverId?: string;
}

export interface SyncBatchResult {
  results: SyncRecordResult[];
  ok: number;
  duplicate: number;
  error: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function processSyncBatch(
  prisma: PrismaClient,
  batch: SyncBatchInput,
): Promise<SyncBatchResult> {
  const results: SyncRecordResult[] = [];

  // Нэг багцад ижил шалгалт олон удаа орж болох тул кэшлэнэ.
  const examCache = new Map<string, Awaited<ReturnType<typeof loadExam>>>();

  async function loadExam(examId: string) {
    const row = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: true },
    });
    return row ? toExam(row) : null;
  }

  for (const record of batch.records) {
    try {
      let exam = examCache.get(record.examId);
      if (exam === undefined) {
        exam = await loadExam(record.examId);
        examCache.set(record.examId, exam);
      }

      if (!exam) {
        results.push({
          id: record.id,
          status: 'error',
          message: `"${record.examId}" шалгалт серверт олдсонгүй.`,
        });
        continue;
      }

      const outcome = await saveSubmission(prisma, exam, record.payload);

      if (outcome.status === 'duplicate') {
        // Хожуу ирсэн хувилбарыг conflict болгож тусад нь хадгална.
        await storeConflict(prisma, exam.id, record, outcome.submission.id);
        results.push({
          id: record.id,
          status: 'duplicate',
          message: 'Энэ сурагч тухайн горимд аль хэдийн хариулт илгээсэн байна.',
          serverId: outcome.submission.id,
        });
      } else {
        results.push({ id: record.id, status: 'ok', serverId: outcome.submission.id });
      }

      await logSync(prisma, record.id, results[results.length - 1]!, batch.deviceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: record.id, status: 'error', message });
      await logSync(prisma, record.id, { id: record.id, status: 'error', message }, batch.deviceId);
    }
  }

  return {
    results,
    ok: results.filter((result) => result.status === 'ok').length,
    duplicate: results.filter((result) => result.status === 'duplicate').length,
    error: results.filter((result) => result.status === 'error').length,
  };
}

/**
 * Давхардсан илгээлтийг `conflict` төлөвтэйгээр хадгална.
 * Unique хязгаарлалт нь `(examId, mode, studentKey)` дээр байдаг тул
 * `studentKey`-д тэмдэглэгээ нэмж хадгална — багш харж шийднэ.
 */
async function storeConflict(
  prisma: PrismaClient,
  examId: string,
  record: SyncBatchInput['records'][number],
  originalId: string,
): Promise<void> {
  const payload = record.payload;
  const studentKey = computeStudentKey(payload.lastName, payload.firstName, payload.className);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { questions: true },
  });
  if (!exam) return;

  const parsed = toExam(exam);
  const scored = scoreAnswers(parsed.questions, payload.answers, parsed.passThreshold);

  const conflictId = newId('conf');
  await prisma.submission.create({
    data: {
      id: conflictId,
      examId,
      mode: payload.mode,
      // Unique индекстэй мөргөлдөхгүйн тулд өвөрмөц дагавар нэмнэ.
      studentKey: `${studentKey}#${conflictId}`,
      lastName: payload.lastName.trim(),
      firstName: payload.firstName.trim(),
      className: payload.className.trim(),
      answersJson: JSON.stringify(payload.answers),
      score: scored.score,
      maxScore: scored.maxScore,
      percent: scored.percent,
      passed: scored.passed,
      startedAt: payload.startedAt,
      submittedAt: payload.submittedAt,
      durationSec: payload.durationSec,
      deviceId: payload.deviceId,
      source: payload.source,
      syncStatus: 'conflict',
      conflictOfId: originalId,
      createdAt: nowIso(),
    },
  });
}

async function logSync(
  prisma: PrismaClient,
  entityId: string,
  result: SyncRecordResult,
  deviceId?: string,
): Promise<void> {
  await prisma.syncLog.create({
    data: {
      id: newId('log'),
      createdAt: nowIso(),
      entity: 'submission',
      entityId,
      status: result.status,
      message: result.message ?? null,
      deviceId: deviceId ?? null,
    },
  });
}
