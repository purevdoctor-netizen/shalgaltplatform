/**
 * Шалгалтын бизнес логик.
 */

import type { PrismaClient } from '@prisma/client';
import type { Exam } from '@shalgalt/shared';
import { TRUEFALSE_OPTIONS } from '@shalgalt/shared';
import { ApiError } from '../lib/errors';
import { newExamId, newId, newTeacherToken } from '../lib/ids';
import { toExam, toQuestionRow } from '../lib/mappers';
import type { CreateExamInput, QuestionInput, UpdateExamInput } from '../schemas';

const EXAM_INCLUDE = { questions: true } as const;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * `truefalse` асуултад сонголт заагаагүй бол стандарт [A: Үнэн, B: Худал]-ыг
 * нэмнэ (ASSUMPTIONS B-02).
 */
function withDefaults(question: QuestionInput, examId: string) {
  const id = question.id ?? newId('q');
  const options =
    question.type === 'truefalse' && (!question.options || question.options.length === 0)
      ? [...TRUEFALSE_OPTIONS]
      : question.options;

  return toQuestionRow(
    {
      id,
      examId,
      order: question.order,
      type: question.type,
      text: question.text,
      points: question.points,
      ...(options ? { options } : {}),
      ...(question.correctOptionIds ? { correctOptionIds: question.correctOptionIds } : {}),
      ...(question.acceptedAnswers ? { acceptedAnswers: question.acceptedAnswers } : {}),
      ...(question.topic !== undefined && question.topic !== '' ? { topic: question.topic } : {}),
    },
    examId,
  );
}

/**
 * Prisma-ийн nested `create` дотор relation талбарыг (`examId`) давхар өгөх
 * боломжгүй тул хасна.
 */
function withoutExamId(row: ReturnType<typeof withDefaults>) {
  const { examId: _examId, ...rest } = row;
  return rest;
}

/** Асуултын `order` давхардаагүй, 1-ээс эхэлсэн дараалалтай эсэх. */
function assertOrders(questions: QuestionInput[]): void {
  const orders = questions.map((question) => question.order);
  if (new Set(orders).size !== orders.length) {
    throw ApiError.badRequest('Асуултын дараалал (`order`) давхардсан байна.');
  }
}

export async function createExam(
  prisma: PrismaClient,
  input: CreateExamInput,
  ownerId?: string,
): Promise<Exam> {
  assertOrders(input.questions);

  const id = newExamId();
  const timestamp = nowIso();

  const row = await prisma.exam.create({
    data: {
      id,
      title: input.title,
      subject: input.subject,
      teacherName: input.teacherName,
      teacherEmail: input.teacherEmail,
      teacherToken: newTeacherToken(),
      ownerId: ownerId ?? null,
      examDate: input.examDate,
      createdAt: timestamp,
      updatedAt: timestamp,
      mode: 'pre',
      status: input.status,
      deliveryMode: input.deliveryMode,
      passThreshold: input.passThreshold,
      durationMin: input.durationMin ?? null,
      shuffle: input.shuffle,
      showAnswersToStudent: input.showAnswersToStudent,
      onePerPage: input.onePerPage,
      questions: {
        create: input.questions.map((question) => withoutExamId(withDefaults(question, id))),
      },
    },
    include: EXAM_INCLUDE,
  });

  return toExam(row);
}

export async function getExam(prisma: PrismaClient, examId: string): Promise<Exam> {
  const row = await prisma.exam.findUnique({ where: { id: examId }, include: EXAM_INCLUDE });
  if (!row) throw ApiError.notFound('Ийм шалгалт олдсонгүй.');
  return toExam(row);
}

export async function deleteExam(prisma: PrismaClient, examId: string): Promise<void> {
  const existing = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Ийм шалгалт олдсонгүй.');
  await prisma.exam.delete({ where: { id: examId } });
}

/**
 * Шалгалт засварлах.
 *
 * `active` болсны дараа АСУУЛТ засварлахыг хориглоно — pre/post харьцуулалт
 * утгагүй болно. Ийм тохиолдолд шинэ шалгалт үүсгэнэ.
 */
export async function updateExam(
  prisma: PrismaClient,
  examId: string,
  input: UpdateExamInput,
): Promise<Exam> {
  const current = await prisma.exam.findUnique({
    where: { id: examId },
    select: { status: true, mode: true },
  });
  if (!current) throw ApiError.notFound('Ийм шалгалт олдсонгүй.');

  if (input.questions && current.status !== 'draft') {
    throw ApiError.conflict(
      'Идэвхтэй болсон шалгалтын асуултыг засах боломжгүй. ' +
        'Хуулбарлан шинэ шалгалт үүсгэнэ үү.',
    );
  }

  if (input.questions) assertOrders(input.questions);

  const row = await prisma.$transaction(async (tx) => {
    if (input.questions) {
      await tx.question.deleteMany({ where: { examId } });
      await tx.question.createMany({
        data: input.questions.map((question) => withDefaults(question, examId)),
      });
    }

    return tx.exam.update({
      where: { id: examId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.teacherName !== undefined ? { teacherName: input.teacherName } : {}),
        ...(input.teacherEmail !== undefined ? { teacherEmail: input.teacherEmail } : {}),
        ...(input.examDate !== undefined ? { examDate: input.examDate } : {}),
        ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
        ...(input.passThreshold !== undefined ? { passThreshold: input.passThreshold } : {}),
        ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
        ...(input.shuffle !== undefined ? { shuffle: input.shuffle } : {}),
        ...(input.showAnswersToStudent !== undefined
          ? { showAnswersToStudent: input.showAnswersToStudent }
          : {}),
        ...(input.onePerPage !== undefined ? { onePerPage: input.onePerPage } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: nowIso(),
      },
      include: EXAM_INCLUDE,
    });
  });

  return toExam(row);
}

/**
 * Горим солих: `pre` → `post`. Буцаах (post → pre) боломжгүй.
 */
export async function switchToPost(
  prisma: PrismaClient,
  examId: string,
): Promise<{ exam: Exam; preCount: number }> {
  const current = await prisma.exam.findUnique({ where: { id: examId }, select: { mode: true } });
  if (!current) throw ApiError.notFound('Ийм шалгалт олдсонгүй.');

  if (current.mode === 'post') {
    throw ApiError.conflict('Шалгалт аль хэдийн ДАРААХ горимд байна. Буцаах боломжгүй.');
  }

  const preCount = await prisma.submission.count({ where: { examId, mode: 'pre' } });

  const row = await prisma.exam.update({
    where: { id: examId },
    data: { mode: 'post', status: 'active', updatedAt: nowIso() },
    include: EXAM_INCLUDE,
  });

  return { exam: toExam(row), preCount };
}

/** Горим солихын өмнө багшид харуулах тоо. */
export async function countSubmissions(
  prisma: PrismaClient,
  examId: string,
): Promise<{ pre: number; post: number }> {
  const [pre, post] = await Promise.all([
    prisma.submission.count({ where: { examId, mode: 'pre' } }),
    prisma.submission.count({ where: { examId, mode: 'post' } }),
  ]);
  return { pre, post };
}
