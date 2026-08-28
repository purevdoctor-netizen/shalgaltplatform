/**
 * Жишээ өгөгдөл — сервер seed, тест, демо-д ашиглана.
 *
 * 1 шалгалт · 10 асуулт (4 single, 2 multi, 2 truefalse, 2 short; 3 сэдэв)
 * 12 сурагч: 9 хоёуланг нь өгсөн, 2 зөвхөн pre, 1 зөвхөн post.
 * Ангилал бүрд ≥1 сурагч ноогдоно.
 *
 * Бүх утга ТОГТМОЛ (Date.now, Math.random ашиглахгүй) тул тест давтагдана.
 */

import type { AnswerValue, Exam, ExamMode, Question, Submission } from './types';
import { computeStudentKey } from './normalize';
import { TRUEFALSE_OPTIONS, TRUE_OPTION_ID, FALSE_OPTION_ID, scoreAnswers } from './scoring';

export const SEED_EXAM_ID = 'seedexam0001';
export const SEED_TEACHER_TOKEN = 'seedtoken0000000000000000000abcd';

const BASE_DATE = '2026-03-02';
const PRE_STARTED_AT = '2026-03-02T01:00:00.000Z';
const POST_STARTED_AT = '2026-03-16T01:00:00.000Z';

const TOPIC_FRACTION = 'Энгийн бутархай';
const TOPIC_DECIMAL = 'Аравтын бутархай';
const TOPIC_PERCENT = 'Хувь';

function option(id: string, text: string): { id: string; text: string } {
  return { id, text };
}

/** Жишээ шалгалтын асуултууд. Нийт оноо = 12. */
export const SEED_QUESTIONS: Question[] = [
  {
    id: 'q01',
    examId: SEED_EXAM_ID,
    order: 1,
    type: 'single',
    text: '3/4 бутархайг аравтын бутархай болгоход хэд гарах вэ?',
    options: [option('A', '0.75'), option('B', '0.34'), option('C', '1.33'), option('D', '0.43')],
    correctOptionIds: ['A'],
    points: 1,
    topic: TOPIC_FRACTION,
  },
  {
    id: 'q02',
    examId: SEED_EXAM_ID,
    order: 2,
    type: 'single',
    text: '2/3 ба 3/5 бутархайн аль нь их вэ?',
    options: [
      option('A', '3/5'),
      option('B', '2/3'),
      option('C', 'Тэнцүү'),
      option('D', 'Харьцуулах боломжгүй'),
    ],
    correctOptionIds: ['B'],
    points: 1,
    topic: TOPIC_FRACTION,
  },
  {
    id: 'q03',
    examId: SEED_EXAM_ID,
    order: 3,
    type: 'truefalse',
    text: 'Хуваарь нь ижил бутархайг нэмэхэд хуваарийг мөн нэмнэ.',
    options: [...TRUEFALSE_OPTIONS],
    correctOptionIds: [FALSE_OPTION_ID],
    points: 1,
    topic: TOPIC_FRACTION,
  },
  {
    id: 'q04',
    examId: SEED_EXAM_ID,
    order: 4,
    type: 'short',
    text: '6/8 бутархайг хураангуйлж бичнэ үү.',
    acceptedAnswers: ['3/4', '0.75', '3 / 4'],
    points: 1,
    topic: TOPIC_FRACTION,
  },
  {
    id: 'q05',
    examId: SEED_EXAM_ID,
    order: 5,
    type: 'single',
    text: '0.25 + 0.4 хэдтэй тэнцэх вэ?',
    options: [option('A', '0.29'), option('B', '0.65'), option('C', '0.45'), option('D', '6.5')],
    correctOptionIds: ['B'],
    points: 2,
    topic: TOPIC_DECIMAL,
  },
  {
    id: 'q06',
    examId: SEED_EXAM_ID,
    order: 6,
    type: 'multi',
    text: 'Дараахаас аль нь 0.5-тай тэнцүү вэ? (олон сонголт)',
    options: [
      option('A', '1/2'),
      option('B', '50%'),
      option('C', '5/100'),
      option('D', '2/4'),
      option('E', '0.05'),
    ],
    correctOptionIds: ['A', 'B', 'D'],
    points: 2,
    topic: TOPIC_DECIMAL,
  },
  {
    id: 'q07',
    examId: SEED_EXAM_ID,
    order: 7,
    type: 'single',
    text: '1.2 × 0.3 хэдтэй тэнцэх вэ?',
    options: [option('A', '0.36'), option('B', '3.6'), option('C', '0.15'), option('D', '1.5')],
    correctOptionIds: ['A'],
    points: 1,
    topic: TOPIC_DECIMAL,
  },
  {
    id: 'q08',
    examId: SEED_EXAM_ID,
    order: 8,
    type: 'truefalse',
    text: '25% нь 1/4-тэй тэнцүү.',
    options: [...TRUEFALSE_OPTIONS],
    correctOptionIds: [TRUE_OPTION_ID],
    points: 1,
    topic: TOPIC_PERCENT,
  },
  {
    id: 'q09',
    examId: SEED_EXAM_ID,
    order: 9,
    type: 'multi',
    text: '200-гийн 15% нь 30. Үүнтэй ижил утгатай илэрхийллийг сонго. (олон сонголт)',
    options: [
      option('A', '200 × 0.15'),
      option('B', '200 ÷ 15'),
      option('C', '200 × 15/100'),
      option('D', '15 × 200'),
    ],
    correctOptionIds: ['A', 'C'],
    points: 1,
    topic: TOPIC_PERCENT,
  },
  {
    id: 'q10',
    examId: SEED_EXAM_ID,
    order: 10,
    type: 'short',
    text: '80-ийн 25% хэд вэ? (зөвхөн тоогоор)',
    acceptedAnswers: ['20', '20.0'],
    points: 1,
    topic: TOPIC_PERCENT,
  },
];

export const SEED_EXAM: Exam = {
  id: SEED_EXAM_ID,
  title: 'Бутархай ба хувь — сэдвийн үнэлгээ',
  subject: 'Математик',
  teacherName: 'Б.Пүрэвдорж',
  teacherEmail: 'bagsh@example.mn',
  teacherToken: SEED_TEACHER_TOKEN,
  examDate: BASE_DATE,
  createdAt: '2026-03-01T02:00:00.000Z',
  updatedAt: '2026-03-01T02:00:00.000Z',
  mode: 'post',
  status: 'active',
  deliveryMode: 'online',
  passThreshold: 60,
  durationMin: 20,
  shuffle: false,
  showAnswersToStudent: true,
  onePerPage: false,
  questions: SEED_QUESTIONS,
};

// ---------------------------------------------------------------------------
// Сурагчид
// ---------------------------------------------------------------------------

export interface SeedStudent {
  lastName: string;
  firstName: string;
  className: string;
  /** Зөв хариулсан асуултын `order` жагсаалт. `null` = тухайн горимд өгөөгүй. */
  preCorrect: number[] | null;
  postCorrect: number[] | null;
}

/**
 * Оноо: q1..q4 = 1, q5 = 2, q6 = 2, q7..q10 = 1 → нийт 12.
 * Хувь = оноо / 12 × 100 (2 орноор бүхэлтгэнэ).
 */
export const SEED_STUDENTS: SeedStudent[] = [
  // --- Өндөр ахиц (≥ 30 нэгж) ---
  {
    lastName: 'Дорж',
    firstName: 'Ану',
    className: '8а',
    preCorrect: [1, 3],
    postCorrect: [1, 2, 3, 4, 5, 7, 8],
  }, //  16.67 → 66.67
  {
    lastName: 'Батаа',
    firstName: 'Болд',
    className: '8а',
    preCorrect: [1, 2, 3],
    postCorrect: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  }, //  25.00 → 91.67
  {
    lastName: 'Сүх',
    firstName: 'Гэрэл',
    className: '8а',
    preCorrect: [1, 2, 4, 5],
    postCorrect: [1, 2, 3, 4, 5, 6, 7],
  }, //  41.67 → 75.00

  // --- Дундаж (10–29.99 нэгж) ---
  {
    lastName: 'Ням',
    firstName: 'Дулам',
    className: '8а',
    preCorrect: [1, 2, 3, 4],
    postCorrect: [1, 2, 3, 4, 5, 8],
  }, //  33.33 → 58.33
  {
    lastName: 'Цэрэн',
    firstName: 'Энх',
    className: '8б',
    preCorrect: [1, 5],
    postCorrect: [1, 2, 5, 8],
  }, //  25.00 → 41.67
  {
    lastName: 'Ганбат',
    firstName: 'Жаргал',
    className: '8б',
    preCorrect: [1, 2, 3, 5],
    postCorrect: [1, 2, 3, 4, 5, 7],
  }, //  41.67 → 58.33

  // --- Бага (0–9.99 нэгж) ---
  {
    lastName: 'Лхагва',
    firstName: 'Золбоо',
    className: '8б',
    preCorrect: [1, 2, 3, 4, 5],
    postCorrect: [1, 2, 3, 4, 5, 7],
  }, //  50.00 → 58.33
  {
    lastName: 'Мөнх',
    firstName: 'Итгэл',
    className: '8б',
    preCorrect: [1, 2, 5, 6],
    postCorrect: [1, 2, 5, 6, 7],
  }, //  50.00 → 58.33

  // --- Буурсан (< 0) ---
  {
    lastName: 'Оюун',
    firstName: 'Хулан',
    className: '8б',
    preCorrect: [1, 2, 3, 4, 5, 6],
    postCorrect: [1, 2, 3, 5, 6],
  }, //  66.67 → 58.33

  // --- Зөвхөн өмнөх ---
  {
    lastName: 'Баяр',
    firstName: 'Тэмүүлэн',
    className: '8а',
    preCorrect: [1, 2, 3],
    postCorrect: null,
  },
  {
    lastName: 'Дашням',
    firstName: 'Уянга',
    className: '8б',
    preCorrect: [1, 2, 4, 5, 6],
    postCorrect: null,
  },

  // --- Зөвхөн дараах ---
  {
    lastName: 'Эрдэнэ',
    firstName: 'Ялалт',
    className: '8а',
    preCorrect: null,
    postCorrect: [1, 2, 3, 4, 5, 6, 7, 8],
  },
];

// ---------------------------------------------------------------------------
// Илгээлт үүсгэх
// ---------------------------------------------------------------------------

/** Тухайн асуултад зөв хариултыг үүсгэнэ. */
function correctAnswerFor(question: Question): AnswerValue {
  switch (question.type) {
    case 'single':
      return question.correctOptionIds?.[0] ?? null;
    case 'truefalse':
      return question.correctOptionIds?.[0] === TRUE_OPTION_ID;
    case 'multi':
      return [...(question.correctOptionIds ?? [])];
    case 'short':
      return question.acceptedAnswers?.[0] ?? null;
    default:
      return null;
  }
}

/** Тухайн асуултад санаатай буруу хариултыг үүсгэнэ. */
function wrongAnswerFor(question: Question): AnswerValue {
  const correct = new Set(question.correctOptionIds ?? []);
  switch (question.type) {
    case 'single': {
      const wrong = question.options?.find((item) => !correct.has(item.id));
      return wrong ? wrong.id : null;
    }
    case 'truefalse':
      return question.correctOptionIds?.[0] !== TRUE_OPTION_ID;
    case 'multi': {
      // Нэг зөвийг орхиж, нэг бурууг нэмнэ → бүтэн оноо авахгүй.
      const wrong = question.options?.find((item) => !correct.has(item.id));
      const partial = [...correct].slice(1);
      return wrong ? [...partial, wrong.id] : partial;
    }
    case 'short':
      return 'мэдэхгүй';
    default:
      return null;
  }
}

function addSeconds(isoDate: string, seconds: number): string {
  return new Date(new Date(isoDate).getTime() + seconds * 1000).toISOString();
}

/** Нэг сурагчийн нэг горимын илгээлтийг үүсгэнэ. */
export function buildSeedSubmission(
  student: SeedStudent,
  mode: ExamMode,
  index: number,
): Submission | null {
  const correctOrders = mode === 'pre' ? student.preCorrect : student.postCorrect;
  if (correctOrders === null) return null;

  const correctSet = new Set(correctOrders);
  const answers = SEED_QUESTIONS.map((question) => ({
    questionId: question.id,
    value: correctSet.has(question.order) ? correctAnswerFor(question) : wrongAnswerFor(question),
  }));

  const result = scoreAnswers(SEED_QUESTIONS, answers, SEED_EXAM.passThreshold);
  const startedAt = mode === 'pre' ? PRE_STARTED_AT : POST_STARTED_AT;
  const durationSec = 420 + index * 37;

  return {
    id: `seed-${mode}-${String(index + 1).padStart(2, '0')}`,
    examId: SEED_EXAM_ID,
    mode,
    studentKey: computeStudentKey(student.lastName, student.firstName, student.className),
    lastName: student.lastName,
    firstName: student.firstName,
    className: student.className,
    answers,
    score: result.score,
    maxScore: result.maxScore,
    percent: result.percent,
    passed: result.passed,
    startedAt: addSeconds(startedAt, index * 15),
    submittedAt: addSeconds(startedAt, index * 15 + durationSec),
    durationSec,
    deviceId: `seed-device-${String(index + 1).padStart(2, '0')}`,
    source: 'online',
    syncStatus: 'synced',
  };
}

/** Тухайн горимын бүх илгээлт. */
export function buildSeedSubmissions(mode: ExamMode): Submission[] {
  const result: Submission[] = [];
  SEED_STUDENTS.forEach((student, index) => {
    const submission = buildSeedSubmission(student, mode, index);
    if (submission) result.push(submission);
  });
  return result;
}

/** Шалгалт + хоёр горимын илгээлтийг нэг дор. */
export function buildSeedDataset(): {
  exam: Exam;
  pre: Submission[];
  post: Submission[];
} {
  return {
    exam: SEED_EXAM,
    pre: buildSeedSubmissions('pre'),
    post: buildSeedSubmissions('post'),
  };
}
