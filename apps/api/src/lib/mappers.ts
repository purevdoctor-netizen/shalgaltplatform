/**
 * Prisma мөр ↔ `@shalgalt/shared` төрлүүдийн хөрвүүлэлт.
 *
 * SQLite нь `Json` болон `String[]`-ыг дэмждэггүй тул JSON-г мөрөнд
 * сериалчилж хадгалдаг (schema.prisma-ийн тайлбар харна уу).
 */

import type {
  Exam as PrismaExam,
  Question as PrismaQuestion,
  Report as PrismaReport,
  Submission as PrismaSubmission,
  EmailQueueItem as PrismaEmailQueueItem,
} from '@prisma/client';
import type {
  AnswerValue,
  EmailQueueItem,
  Exam,
  ExamMode,
  ExamStatus,
  DeliveryMode,
  Question,
  QuestionType,
  Report,
  ReportStats,
  Submission,
  SyncStatus,
} from '@shalgalt/shared';

// ---------------------------------------------------------------------------
// JSON туслах
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stringifyOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export function toQuestion(row: PrismaQuestion): Question {
  const question: Question = {
    id: row.id,
    examId: row.examId,
    order: row.order,
    type: row.type as QuestionType,
    text: row.text,
    points: row.points,
  };

  const options = parseJson<{ id: string; text: string }[]>(row.optionsJson, []);
  if (options.length > 0) question.options = options;

  const correct = parseJson<string[]>(row.correctOptionIdsJson, []);
  if (correct.length > 0) question.correctOptionIds = correct;

  const accepted = parseJson<string[]>(row.acceptedAnswersJson, []);
  if (accepted.length > 0) question.acceptedAnswers = accepted;

  if (row.topic !== null) question.topic = row.topic;

  return question;
}

export function toQuestionRow(question: Question, examId: string): PrismaQuestion {
  return {
    id: question.id,
    examId,
    order: question.order,
    type: question.type,
    text: question.text,
    optionsJson: stringifyOrNull(question.options),
    correctOptionIdsJson: stringifyOrNull(question.correctOptionIds),
    acceptedAnswersJson: stringifyOrNull(question.acceptedAnswers),
    points: question.points,
    topic: question.topic ?? null,
  };
}

/** Сурагчид харуулах хувилбар — зөв хариултыг хасна. */
export function stripAnswers(question: Question): Question {
  const { correctOptionIds: _correct, acceptedAnswers: _accepted, ...rest } = question;
  return rest;
}

// ---------------------------------------------------------------------------
// Exam
// ---------------------------------------------------------------------------

export function toExam(row: PrismaExam & { questions: PrismaQuestion[] }): Exam {
  const exam: Exam = {
    id: row.id,
    title: row.title,
    subject: row.subject,
    teacherName: row.teacherName,
    teacherEmail: row.teacherEmail,
    teacherToken: row.teacherToken,
    examDate: row.examDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mode: row.mode as ExamMode,
    status: row.status as ExamStatus,
    deliveryMode: row.deliveryMode as DeliveryMode,
    passThreshold: row.passThreshold,
    shuffle: row.shuffle,
    showAnswersToStudent: row.showAnswersToStudent,
    onePerPage: row.onePerPage,
    questions: row.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(toQuestion),
  };
  if (row.durationMin !== null) exam.durationMin = row.durationMin;
  if (row.ownerId !== null) exam.ownerId = row.ownerId;
  return exam;
}

/**
 * Сурагчид өгөх хувилбар — зөв хариулт болон багшийн нууц мэдээллийг хасна.
 */
export function toPublicExam(exam: Exam): Omit<Exam, 'teacherToken' | 'teacherEmail' | 'ownerId'> {
  const { teacherToken: _token, teacherEmail: _email, ownerId: _owner, ...rest } = exam;
  return { ...rest, questions: exam.questions.map(stripAnswers) };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export function toSubmission(row: PrismaSubmission): Submission {
  return {
    id: row.id,
    examId: row.examId,
    mode: row.mode as ExamMode,
    studentKey: row.studentKey,
    lastName: row.lastName,
    firstName: row.firstName,
    className: row.className,
    answers: parseJson<{ questionId: string; value: AnswerValue }[]>(row.answersJson, []),
    score: row.score,
    maxScore: row.maxScore,
    percent: row.percent,
    passed: row.passed,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    durationSec: row.durationSec,
    deviceId: row.deviceId,
    source: row.source as Submission['source'],
    syncStatus: row.syncStatus as SyncStatus,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function toReport(row: PrismaReport): Report {
  const report: Report = {
    id: row.id,
    examId: row.examId,
    generatedAt: row.generatedAt,
    stats: parseJson<ReportStats>(row.statsJson, {} as ReportStats),
    emailStatus: row.emailStatus as Report['emailStatus'],
  };
  if (row.docxFileName !== null) {
    report.docxBlobId = row.docxFileName;
    report.docxUrl = `/api/reports/${row.id}/download`;
  }
  if (row.emailError !== null) report.emailError = row.emailError;
  if (row.emailSentAt !== null) report.emailSentAt = row.emailSentAt;
  return report;
}

// ---------------------------------------------------------------------------
// EmailQueueItem
// ---------------------------------------------------------------------------

export function toEmailQueueItem(row: PrismaEmailQueueItem): EmailQueueItem {
  const item: EmailQueueItem = {
    id: row.id,
    reportId: row.reportId,
    examId: row.examId,
    to: row.to,
    createdAt: row.createdAt,
    attempts: row.attempts,
    status: row.status as EmailQueueItem['status'],
  };
  if (row.lastError !== null) item.lastError = row.lastError;
  return item;
}
