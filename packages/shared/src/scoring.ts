/**
 * Асуултын оноолт ба асуултын дараалал холих.
 * Клиент, сервер хоёулаа ЯГ ижил логикоор ажиллана.
 */

import type { AnswerValue, Exam, Question, QuestionScore, ScoreResult, Submission } from './types';
import { fnv1a32, matchesAccepted } from './normalize';

// ---------------------------------------------------------------------------
// truefalse төрлийн дүрслэл
// ---------------------------------------------------------------------------
//
// ASSUMPTION: `AnswerValue` төрөлд `boolean` байгаа тул сурагчийн хариулт
// `true`/`false` байдлаар хадгалагдана. Гэхдээ CSV импортын `correct` багана
// truefalse-д `A`/`B` гэж бичигддэг тул асуулт өөрөө `options` = [A: Үнэн,
// B: Худал] агуулж, `correctOptionIds` нь `['A']` эсвэл `['B']` байна.
// Оноолтын үед boolean → сонголтын id рүү хөрвүүлж харьцуулна.

export const TRUE_OPTION_ID = 'A';
export const FALSE_OPTION_ID = 'B';

export const TRUEFALSE_OPTIONS: readonly { id: string; text: string }[] = [
  { id: TRUE_OPTION_ID, text: 'Үнэн' },
  { id: FALSE_OPTION_ID, text: 'Худал' },
];

/** boolean хариултыг сонголтын id болгоно. */
export function booleanToOptionId(value: boolean): string {
  return value ? TRUE_OPTION_ID : FALSE_OPTION_ID;
}

/** Сонголтын id-г boolean болгоно (танигдахгүй бол `null`). */
export function optionIdToBoolean(id: string): boolean | null {
  if (id === TRUE_OPTION_ID) return true;
  if (id === FALSE_OPTION_ID) return false;
  return null;
}

// ---------------------------------------------------------------------------
// Хариулт өгсөн эсэх
// ---------------------------------------------------------------------------

/** Сурагч тухайн асуултад ямар нэг хариулт өгсөн эсэх. */
export function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

// ---------------------------------------------------------------------------
// Зөв эсэхийг шалгах
// ---------------------------------------------------------------------------

/**
 * Хариулт зөв эсэх.
 *
 * - `single`     — сонгосон id нь `correctOptionIds` дотор байх
 * - `multi`      — БҮХ зөвийг сонгосон бөгөөд НЭГ Ч буруу сонгоогүй байх
 *                  (хэсэгчилсэн оноо байхгүй)
 * - `truefalse`  — boolean → `A`/`B` болгож `correctOptionIds`-тэй харьцуулна
 * - `short`      — `normalizeText()`-ээр нормчилж `acceptedAnswers`-тэй яг тэнцүү байх
 */
export function isCorrect(question: Question, value: AnswerValue): boolean {
  if (!isAnswered(value)) return false;

  switch (question.type) {
    case 'single': {
      if (typeof value !== 'string') return false;
      const correct = question.correctOptionIds ?? [];
      return correct.includes(value);
    }

    case 'truefalse': {
      let optionId: string | null = null;
      if (typeof value === 'boolean') {
        optionId = booleanToOptionId(value);
      } else if (typeof value === 'string') {
        // Хуучин/импортын өгөгдөл шууд 'A'/'B' байж болно.
        optionId = value;
      }
      if (optionId === null) return false;
      const correct = question.correctOptionIds ?? [];
      return correct.includes(optionId);
    }

    case 'multi': {
      if (!Array.isArray(value)) return false;
      const correct = question.correctOptionIds ?? [];
      if (correct.length === 0) return false;
      const selected = new Set(value);
      if (selected.size !== correct.length) return false;
      return correct.every((id) => selected.has(id));
    }

    case 'short': {
      if (typeof value !== 'string') return false;
      const accepted = question.acceptedAnswers ?? [];
      if (accepted.length === 0) return false;
      return matchesAccepted(value, accepted);
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Оноо
// ---------------------------------------------------------------------------

/** Нэг асуултын авсан оноо (зөв бол бүтэн оноо, үгүй бол 0). */
export function scoreQuestion(question: Question, value: AnswerValue): number {
  return isCorrect(question, value) ? question.points : 0;
}

/** Шалгалтын нийт боломжит оноо. */
export function maxScoreOf(questions: readonly Question[]): number {
  return questions.reduce((sum, q) => sum + q.points, 0);
}

/**
 * Тоог заасан орны нарийвчлалаар бүхэлтгэнэ.
 * Хувийн утгыг хадгалахдаа 2 орноор бүхэлтгэдэг тул нийтлэг туслах функц.
 */
export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/**
 * Бүх хариултыг оноолж, нийт дүнг гаргана.
 *
 * `percent` нь 0–100 масштабтай, 2 орноор бүхэлтгэгдэнэ (Submission-д ийм
 * байдлаар хадгалагдана — анализ энэ хадгалсан утгыг ашиглана).
 */
export function scoreAnswers(
  questions: readonly Question[],
  answers: readonly { questionId: string; value: AnswerValue }[],
  passThreshold: number,
): ScoreResult {
  const answerMap = new Map<string, AnswerValue>();
  for (const answer of answers) {
    answerMap.set(answer.questionId, answer.value);
  }

  const perQuestion: QuestionScore[] = questions.map((question) => {
    const value = answerMap.has(question.id) ? (answerMap.get(question.id) as AnswerValue) : null;
    const correct = isCorrect(question, value);
    return {
      questionId: question.id,
      order: question.order,
      type: question.type,
      answered: isAnswered(value),
      correct,
      points: question.points,
      earned: correct ? question.points : 0,
    };
  });

  const score = roundTo(
    perQuestion.reduce((sum, item) => sum + item.earned, 0),
    4,
  );
  const maxScore = roundTo(maxScoreOf(questions), 4);
  const percent = maxScore > 0 ? roundTo((score / maxScore) * 100, 2) : 0;

  return {
    score,
    maxScore,
    percent,
    passed: maxScore > 0 && percent >= passThreshold,
    perQuestion,
  };
}

/** Бэлэн `Submission`-ыг дахин оноолох (сервер талын баталгаажуулалтад). */
export function rescoreSubmission(exam: Exam, submission: Submission): ScoreResult {
  return scoreAnswers(exam.questions, submission.answers, exam.passThreshold);
}

// ---------------------------------------------------------------------------
// Асуултын дараалал холих
// ---------------------------------------------------------------------------

/**
 * `seed = hash(studentKey + examId)` — нэг сурагчид pre/post хоёуланд нь
 * ИЖИЛ холимог дараалал өгнө. `questionId` хэзээ ч өөрчлөгдөхгүй тул
 * оноолт болон анализ дараалалаас хамаарахгүй.
 */
export function shuffleSeed(studentKey: string, examId: string): number {
  return fnv1a32(`${studentKey}${examId}`);
}

/** mulberry32 — жижиг, детерминистик PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates холилт — өгөгдсөн seed-д үргэлж ижил үр дүн. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = items.slice();
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Тухайн сурагчид харуулах асуултын дараалал.
 * `exam.shuffle === false` бол анхны дараалал хэвээр.
 */
export function orderQuestionsFor(exam: Exam, studentKey: string): Question[] {
  const ordered = exam.questions.slice().sort((a, b) => a.order - b.order);
  if (!exam.shuffle) return ordered;
  return seededShuffle(ordered, shuffleSeed(studentKey, exam.id));
}
