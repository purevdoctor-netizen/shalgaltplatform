/**
 * Илгээлтийн бизнес логик — сервер талд ДАХИН оноолж баталгаажуулна.
 *
 * Клиентээс ирсэн оноог хэзээ ч шууд итгэж хадгалахгүй: `@shalgalt/shared`-ийн
 * ижил `scoreAnswers()`-ээр дахин тооцно.
 */

import type { PrismaClient } from '@prisma/client';
import type { Exam, Submission } from '@shalgalt/shared';
import { computeStudentKey, scoreAnswers } from '@shalgalt/shared';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { toSubmission } from '../lib/mappers';
import type { SubmissionInput } from '../schemas';

export interface SaveResult {
  status: 'ok' | 'duplicate';
  submission: Submission;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Илгээлтийг хадгална.
 *
 * Давхардлын дүрэм: `(examId, mode, studentKey)` давтагдвал СЕРВЕР ДЭЭР
 * ХАДГАЛАГДСАН ЭХНИЙХ нь үлдэнэ; шинэ ирсэн нь `duplicate` гэж буцна.
 */
export async function saveSubmission(
  prisma: PrismaClient,
  exam: Exam,
  input: SubmissionInput,
): Promise<SaveResult> {
  if (exam.status === 'closed') {
    throw ApiError.conflict('Энэ шалгалт хаагдсан байна.');
  }

  // Сервер өөрөө түлхүүрийг тооцно — клиентийн утгыг зөвхөн шалгах зорилгоор авна.
  const studentKey = computeStudentKey(input.lastName, input.firstName, input.className);
  if (input.studentKey && input.studentKey !== studentKey) {
    throw ApiError.badRequest('`studentKey` нэр/ангитай тохирохгүй байна.');
  }

  const existing = await prisma.submission.findUnique({
    where: {
      examId_mode_studentKey: { examId: exam.id, mode: input.mode, studentKey },
    },
  });
  if (existing) {
    return { status: 'duplicate', submission: toSubmission(existing) };
  }

  const result = scoreAnswers(exam.questions, input.answers, exam.passThreshold);
  const validIds = new Set(exam.questions.map((question) => question.id));
  const answers = input.answers.filter((answer) => validIds.has(answer.questionId));

  const created = await prisma.submission.create({
    data: {
      id: input.id ?? newId('sub'),
      examId: exam.id,
      mode: input.mode,
      studentKey,
      lastName: input.lastName.trim(),
      firstName: input.firstName.trim(),
      className: input.className.trim(),
      answersJson: JSON.stringify(answers),
      score: result.score,
      maxScore: result.maxScore,
      percent: result.percent,
      passed: result.passed,
      startedAt: input.startedAt,
      submittedAt: input.submittedAt,
      durationSec: input.durationSec,
      deviceId: input.deviceId,
      source: input.source,
      syncStatus: 'synced',
      createdAt: nowIso(),
    },
  });

  return { status: 'ok', submission: toSubmission(created) };
}

/**
 * Багшид зориулсан илгээлтүүд.
 *
 * `conflict` төлөвтэй бичлэгийг ХАСНА — эс бөгөөс тайланд нэг сурагч хоёр
 * хүн болж тоологдоно. Тэдгээрийг `listConflicts()`-оор тусад нь харна.
 */
export async function listSubmissions(
  prisma: PrismaClient,
  examId: string,
  mode?: 'pre' | 'post',
): Promise<Submission[]> {
  const rows = await prisma.submission.findMany({
    where: { examId, syncStatus: { not: 'conflict' }, ...(mode ? { mode } : {}) },
    orderBy: [{ mode: 'asc' }, { submittedAt: 'asc' }],
  });
  return rows.map(toSubmission);
}

/** Сурагчийн өөрийн дүн (post дэлгэцэнд pre дүнг харуулахад). */
export async function findMySubmissions(
  prisma: PrismaClient,
  examId: string,
  studentKey: string,
  mode?: 'pre' | 'post',
): Promise<Submission[]> {
  const rows = await prisma.submission.findMany({
    where: { examId, studentKey, ...(mode ? { mode } : {}) },
    orderBy: { submittedAt: 'asc' },
  });
  return rows.map(toSubmission);
}

/** Давхардсан гэж тэмдэглэгдсэн бичлэгүүд (багшийн самбарт харагдана). */
export async function listConflicts(prisma: PrismaClient, examId: string): Promise<Submission[]> {
  const rows = await prisma.submission.findMany({
    where: { examId, syncStatus: 'conflict' },
    orderBy: { submittedAt: 'asc' },
  });
  return rows.map(toSubmission);
}

/** Багш давхардсан бичлэгийг устгах. */
export async function deleteSubmission(
  prisma: PrismaClient,
  examId: string,
  submissionId: string,
): Promise<void> {
  const existing = await prisma.submission.findFirst({
    where: { id: submissionId, examId },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Ийм илгээлт олдсонгүй.');
  await prisma.submission.delete({ where: { id: submissionId } });
}

/** CSV экспорт — Excel-д кирилл зөв нээгдэхийн тулд BOM нэмнэ. */
export function submissionsToCsv(exam: Exam, submissions: Submission[]): string {
  const questionIds = exam.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => question.id);

  const header = [
    'Горим',
    'Овог',
    'Нэр',
    'Анги',
    'Оноо',
    'Нийт оноо',
    'Хувь',
    'Тэнцсэн',
    'Эхэлсэн',
    'Илгээсэн',
    'Хугацаа (сек)',
    'Эх сурвалж',
    ...exam.questions.map((question) => `А${question.order}`),
  ];

  const escape = (value: string): string =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const format = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('|');
    if (typeof value === 'boolean') return value ? 'Үнэн' : 'Худал';
    return String(value);
  };

  const lines = [header.map(escape).join(';')];

  for (const submission of submissions) {
    const answerMap = new Map(submission.answers.map((a) => [a.questionId, a.value]));
    const row = [
      submission.mode === 'pre' ? 'ӨМНӨХ' : 'ДАРААХ',
      submission.lastName,
      submission.firstName,
      submission.className,
      String(submission.score),
      String(submission.maxScore),
      String(submission.percent),
      submission.passed ? 'Тийм' : 'Үгүй',
      submission.startedAt,
      submission.submittedAt,
      String(submission.durationSec),
      submission.source,
      ...questionIds.map((id) => format(answerMap.get(id))),
    ];
    lines.push(row.map((cell) => escape(cell)).join(';'));
  }

  return `﻿${lines.join('\r\n')}\r\n`;
}
