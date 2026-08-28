import { describe, expect, it } from 'vitest';
import type { Exam, Question } from './types';
import {
  FALSE_OPTION_ID,
  TRUE_OPTION_ID,
  isAnswered,
  isCorrect,
  maxScoreOf,
  orderQuestionsFor,
  roundTo,
  scoreAnswers,
  scoreQuestion,
  seededShuffle,
  shuffleSeed,
} from './scoring';

function makeQuestion(overrides: Partial<Question> & Pick<Question, 'id' | 'type'>): Question {
  return {
    examId: 'e1',
    order: 1,
    text: 'Асуулт',
    points: 1,
    ...overrides,
  } as Question;
}

const single = makeQuestion({
  id: 'q1',
  type: 'single',
  order: 1,
  options: [
    { id: 'A', text: 'A' },
    { id: 'B', text: 'B' },
    { id: 'C', text: 'C' },
  ],
  correctOptionIds: ['B'],
  points: 1,
});

const multi = makeQuestion({
  id: 'q2',
  type: 'multi',
  order: 2,
  options: [
    { id: 'A', text: 'A' },
    { id: 'B', text: 'B' },
    { id: 'C', text: 'C' },
    { id: 'D', text: 'D' },
  ],
  correctOptionIds: ['A', 'C'],
  points: 2,
});

const truefalse = makeQuestion({
  id: 'q3',
  type: 'truefalse',
  order: 3,
  options: [
    { id: TRUE_OPTION_ID, text: 'Үнэн' },
    { id: FALSE_OPTION_ID, text: 'Худал' },
  ],
  correctOptionIds: [TRUE_OPTION_ID],
  points: 1,
});

const short = makeQuestion({
  id: 'q4',
  type: 'short',
  order: 4,
  acceptedAnswers: ['3/4', '0.75'],
  points: 1.5,
});

describe('isAnswered', () => {
  it('хоосон утгыг таньна', () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered('')).toBe(false);
    expect(isAnswered('   ')).toBe(false);
    expect(isAnswered([])).toBe(false);
  });

  it('утгатай хариултыг таньна', () => {
    expect(isAnswered('A')).toBe(true);
    expect(isAnswered(['A'])).toBe(true);
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(true)).toBe(true);
  });
});

describe('single', () => {
  it('зөв сонголт', () => {
    expect(isCorrect(single, 'B')).toBe(true);
  });
  it('буруу сонголт', () => {
    expect(isCorrect(single, 'A')).toBe(false);
  });
  it('хариулаагүй', () => {
    expect(isCorrect(single, null)).toBe(false);
  });
  it('буруу төрлийн утга', () => {
    expect(isCorrect(single, ['B'])).toBe(false);
  });
});

describe('multi — хэсэгчилсэн оноо байхгүй', () => {
  it('яг бүх зөвийг сонговол бүтэн оноо', () => {
    expect(isCorrect(multi, ['A', 'C'])).toBe(true);
    expect(isCorrect(multi, ['C', 'A'])).toBe(true); // дараалал хамаарахгүй
    expect(scoreQuestion(multi, ['A', 'C'])).toBe(2);
  });

  it('нэг зөв дутуу бол 0', () => {
    expect(isCorrect(multi, ['A'])).toBe(false);
    expect(scoreQuestion(multi, ['A'])).toBe(0);
  });

  it('нэг буруу нэмбэл 0', () => {
    expect(isCorrect(multi, ['A', 'C', 'B'])).toBe(false);
    expect(scoreQuestion(multi, ['A', 'C', 'B'])).toBe(0);
  });

  it('давхардсан сонголтыг ялгаж үзнэ', () => {
    // Set хэмжээ 1 ≠ correct.length 2 → буруу
    expect(isCorrect(multi, ['A', 'A'])).toBe(false);
  });
});

describe('truefalse', () => {
  it('boolean хариулт', () => {
    expect(isCorrect(truefalse, true)).toBe(true);
    expect(isCorrect(truefalse, false)).toBe(false);
  });

  it('сонголтын id хэлбэрээр ирсэн хариулт', () => {
    expect(isCorrect(truefalse, TRUE_OPTION_ID)).toBe(true);
    expect(isCorrect(truefalse, FALSE_OPTION_ID)).toBe(false);
  });

  it('зөв нь "Худал" байх тохиолдол', () => {
    const q = { ...truefalse, correctOptionIds: [FALSE_OPTION_ID] };
    expect(isCorrect(q, false)).toBe(true);
    expect(isCorrect(q, true)).toBe(false);
  });
});

describe('short — нормчлолтой яг таарах', () => {
  it('зай, том/жижиг үсэг, төгсгөлийн цэгээс хамаарахгүй', () => {
    expect(isCorrect(short, ' 0.75 ')).toBe(true);
    expect(isCorrect(short, '3/4.')).toBe(true);
  });

  it('fuzzy таарахгүй', () => {
    expect(isCorrect(short, '0,75')).toBe(false);
    expect(isCorrect(short, '0.7')).toBe(false);
  });

  it('acceptedAnswers хоосон бол үргэлж буруу', () => {
    const q = makeQuestion({ id: 'q9', type: 'short', order: 9, acceptedAnswers: [] });
    expect(isCorrect(q, 'юу ч бай')).toBe(false);
  });
});

describe('scoreAnswers', () => {
  const questions = [single, multi, truefalse, short]; // нийт оноо = 1 + 2 + 1 + 1.5 = 5.5

  it('нийт боломжит оноо', () => {
    expect(maxScoreOf(questions)).toBe(5.5);
  });

  it('бүгд зөв', () => {
    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', value: 'B' },
        { questionId: 'q2', value: ['A', 'C'] },
        { questionId: 'q3', value: true },
        { questionId: 'q4', value: '3/4' },
      ],
      60,
    );
    expect(result.score).toBe(5.5);
    expect(result.maxScore).toBe(5.5);
    expect(result.percent).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('хэсэгчилсэн — 1 + 1 = 2 / 5.5 = 36.36%', () => {
    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', value: 'B' }, // 1
        { questionId: 'q2', value: ['A'] }, // 0
        { questionId: 'q3', value: true }, // 1
        { questionId: 'q4', value: 'буруу' }, // 0
      ],
      60,
    );
    expect(result.score).toBe(2);
    expect(result.percent).toBe(36.36); // 2/5.5*100 = 36.3636…
    expect(result.passed).toBe(false);
  });

  it('огт хариулаагүй', () => {
    const result = scoreAnswers(questions, [], 60);
    expect(result.score).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.perQuestion).toHaveLength(4);
    expect(result.perQuestion.every((item) => !item.answered && !item.correct)).toBe(true);
  });

  it('тэнцэх босго яг таарвал тэнцсэн гэж үзнэ', () => {
    // 3.3 / 5.5 = 60.00%
    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', value: 'B' }, // 1
        { questionId: 'q2', value: ['A', 'C'] }, // 2
        { questionId: 'q3', value: false }, // 0
        { questionId: 'q4', value: 'үгүй' }, // 0
      ],
      54.55,
    );
    expect(result.score).toBe(3);
    expect(result.percent).toBe(54.55); // 3/5.5*100 = 54.5454… → 54.55
    expect(result.passed).toBe(true);

    // Ижил оноотой ч босго 0.01-ээр өндөр бол тэнцэхгүй
    const stricter = scoreAnswers(
      questions,
      [
        { questionId: 'q1', value: 'B' },
        { questionId: 'q2', value: ['A', 'C'] },
      ],
      54.56,
    );
    expect(stricter.percent).toBe(54.55);
    expect(stricter.passed).toBe(false);
  });

  it('асуултгүй шалгалт 0 хувь', () => {
    const result = scoreAnswers([], [], 60);
    expect(result.maxScore).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('roundTo', () => {
  it('2 орноор бүхэлтгэнэ', () => {
    expect(roundTo(66.666666, 2)).toBe(66.67);
    expect(roundTo(1 / 3, 4)).toBe(0.3333);
    expect(roundTo(2.345, 2)).toBe(2.35);
  });

  it('сөрөг тоо', () => {
    expect(roundTo(-8.335, 2)).toBe(-8.34);
  });
});

describe('дараалал холих', () => {
  const exam: Exam = {
    id: 'e1',
    title: 'T',
    subject: 'S',
    teacherName: 'B',
    teacherEmail: 'b@e.mn',
    teacherToken: 't'.repeat(32),
    examDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    mode: 'pre',
    status: 'active',
    deliveryMode: 'online',
    passThreshold: 60,
    shuffle: true,
    showAnswersToStudent: true,
    onePerPage: false,
    questions: Array.from({ length: 10 }, (_, i) =>
      makeQuestion({ id: `q${i + 1}`, type: 'single', order: i + 1 }),
    ),
  };

  it('ижил seed → ижил дараалал', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 12345);
    const b = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 12345);
    expect(a).toEqual(b);
  });

  it('өөр seed → өөр дараалал', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 1);
    const b = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 2);
    expect(a).not.toEqual(b);
  });

  it('элемент алдагдахгүй', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(
      seededShuffle(source, 777)
        .slice()
        .sort((x, y) => x - y),
    ).toEqual(source);
  });

  it('нэг сурагчид pre/post ижил дараалал өгнө', () => {
    const key = 'student-abc';
    const pre = orderQuestionsFor({ ...exam, mode: 'pre' }, key).map((q) => q.id);
    const post = orderQuestionsFor({ ...exam, mode: 'post' }, key).map((q) => q.id);
    expect(pre).toEqual(post);
  });

  it('өөр сурагчид өөр дараалал өгнө', () => {
    const a = orderQuestionsFor(exam, 'student-a').map((q) => q.id);
    const b = orderQuestionsFor(exam, 'student-b').map((q) => q.id);
    expect(a).not.toEqual(b);
  });

  it('shuffle=false бол анхны дараалал', () => {
    const ordered = orderQuestionsFor({ ...exam, shuffle: false }, 'student-a').map((q) => q.order);
    expect(ordered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('shuffleSeed детерминистик', () => {
    expect(shuffleSeed('k', 'e')).toBe(shuffleSeed('k', 'e'));
    expect(shuffleSeed('k', 'e')).not.toBe(shuffleSeed('k', 'f'));
  });
});
