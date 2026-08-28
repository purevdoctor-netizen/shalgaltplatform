/**
 * `offlineQr` горимын payload үүсгэх / задлах туслахууд.
 */

import type { Exam, ExamMode, Question } from '@shalgalt/shared';
import {
  buildExamQrSlides,
  decodePayload,
  decryptSecrets,
  encodePayload,
  encryptSecrets,
  generateSecretKey,
  mergeQuestionsFromQr,
  splitQuestionsForQr,
  type OfflineExamPayload,
} from '@shalgalt/shared';
import { config } from '../config';

/**
 * Шалгалтын QR слайдуудыг үүсгэнэ.
 *
 * Зөв хариултыг AES-GCM-ээр шифрлэнэ — түлхүүр нь payload-тай ХАМТ явдаг тул
 * энэ нь криптографийн хамгаалалт БИШ, зөвхөн санамсаргүй харагдацаас
 * хамгаална (README §11).
 */
export async function buildOfflineExamSlides(
  exam: Exam,
  mode: ExamMode,
  chunkId: string,
): Promise<{ slides: string[]; secretKey: string; encodedLength: number }> {
  const { publicQuestions, secrets } = splitQuestionsForQr(exam.questions);
  const secretKey = await generateSecretKey();
  const encryptedSecrets = await encryptSecrets(secrets, secretKey);

  const payload: OfflineExamPayload = {
    v: 1,
    e: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      teacherName: exam.teacherName,
      mode,
      passThreshold: exam.passThreshold,
      shuffle: exam.shuffle,
      showAnswers: exam.showAnswersToStudent,
      onePerPage: exam.onePerPage,
      questions: publicQuestions,
      ...(exam.durationMin !== undefined ? { durationMin: exam.durationMin } : {}),
    },
    s: encryptedSecrets,
    k: secretKey,
  };

  const encoded = encodePayload(payload);
  const slides = buildExamQrSlides(encoded, {
    appUrl: config.publicAppUrl,
    chunkId,
    maxBytes: config.qrMaxBytes,
  });

  return { slides, secretKey, encodedLength: encoded.length };
}

/** Кодчилогдсон payload-оос бүрэн `Exam`-ыг сэргээнэ (зөв хариулт тайлагдана). */
export async function decodeOfflineExam(encoded: string): Promise<{
  exam: Exam;
  questions: Question[];
  secretKey: string;
}> {
  const payload = decodePayload<OfflineExamPayload>(encoded);
  if (payload.v !== 1) throw new Error('QR-ын хувилбар тохирохгүй байна.');

  const secrets = await decryptSecrets(payload.s, payload.k);
  const questions = mergeQuestionsFromQr(payload.e.id, payload.e.questions, secrets);
  const now = new Date().toISOString();

  const exam: Exam = {
    id: payload.e.id,
    title: payload.e.title,
    subject: payload.e.subject,
    teacherName: payload.e.teacherName,
    // offlineQr payload-д багшийн имэйл болон токен ОРДОГГҮЙ
    teacherEmail: '',
    teacherToken: '',
    examDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    mode: payload.e.mode,
    status: 'active',
    deliveryMode: 'offlineQr',
    passThreshold: payload.e.passThreshold,
    shuffle: payload.e.shuffle,
    showAnswersToStudent: payload.e.showAnswers,
    onePerPage: payload.e.onePerPage,
    questions,
    ...(payload.e.durationMin !== undefined ? { durationMin: payload.e.durationMin } : {}),
  };

  return { exam, questions, secretKey: payload.k };
}
