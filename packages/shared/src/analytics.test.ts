import { describe, expect, it } from 'vitest';
import type { AnswerValue, Exam, Question, Submission } from './types';
import {
  absoluteGain,
  categorize,
  cohensDPaired,
  computeReportStats,
  effectSizeLabel,
  groupStats,
  hakeGain,
  mean,
  median,
  normalizedGain,
  pairedTTest,
  sampleSd,
  tCDF,
  twoTailedPValue,
} from './analytics';
import { buildSeedDataset, SEED_EXAM } from './seed-data';

// ===========================================================================
// Тестийн жишиг өгөгдөл
//
// 4 асуулт × 1 оноо → нийт 4. Хувь = 25 × (зөв хариултын тоо).
//
//        pre зөв       pre %   post зөв          post %   ахиц
//  A     q1            25      q1,q2,q3          75       +50
//  B     q1,q2         50      q1,q3,q4          75       +25
//  C     q1,q3         50      q1,q2,q3,q4      100       +50
//  D     q1,q2,q3      75      q1,q2,q3          75         0
//  E     —              0      q1                25       +25
//
//  Асуултын түвшинд (5 сурагчаар):
//    q1  pre 4/5 = 80%   post 5/5 = 100%   ахиц +20
//    q2  pre 2/5 = 40%   post 3/5 =  60%   ахиц +20
//    q3  pre 2/5 = 40%   post 4/5 =  80%   ахиц +40
//    q4  pre 0/5 =  0%   post 2/5 =  40%   ахиц +40
//  Сэдэв А (q1,q2) = +20 · Сэдэв Б (q3,q4) = +40
// ===========================================================================

const TOPIC_A = 'Сэдэв А';
const TOPIC_B = 'Сэдэв Б';

const QUESTIONS: Question[] = [1, 2, 3, 4].map((order) => ({
  id: `q${order}`,
  examId: 'fx',
  order,
  type: 'single',
  text: `Асуулт ${order}`,
  options: [
    { id: 'A', text: 'Зөв' },
    { id: 'B', text: 'Буруу' },
  ],
  correctOptionIds: ['A'],
  points: 1,
  topic: order <= 2 ? TOPIC_A : TOPIC_B,
}));

const FIXTURE_EXAM: Exam = {
  id: 'fx',
  title: 'Жишиг шалгалт',
  subject: 'Тест',
  teacherName: 'Багш',
  teacherEmail: 'b@e.mn',
  teacherToken: 't'.repeat(32),
  examDate: '2026-01-10',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  mode: 'post',
  status: 'active',
  deliveryMode: 'online',
  passThreshold: 60,
  shuffle: false,
  showAnswersToStudent: true,
  onePerPage: false,
  questions: QUESTIONS,
};

interface Row {
  key: string;
  correct: number[];
}

function makeSubmission(row: Row, mode: 'pre' | 'post', index: number): Submission {
  const correctSet = new Set(row.correct);
  const answers = QUESTIONS.map((question) => ({
    questionId: question.id,
    value: (correctSet.has(question.order) ? 'A' : 'B') as AnswerValue,
  }));
  const score = row.correct.length;
  const percent = (score / QUESTIONS.length) * 100;
  const stamp = mode === 'pre' ? '2026-01-10T00:00:00.000Z' : '2026-01-24T00:00:00.000Z';
  return {
    id: `${mode}-${row.key}`,
    examId: 'fx',
    mode,
    studentKey: row.key,
    lastName: `Овог${row.key}`,
    firstName: `Нэр${row.key}`,
    className: '9а',
    answers,
    score,
    maxScore: QUESTIONS.length,
    percent,
    passed: percent >= FIXTURE_EXAM.passThreshold,
    startedAt: stamp,
    submittedAt: stamp,
    durationSec: 300 + index,
    deviceId: `dev-${row.key}`,
    source: 'online',
    syncStatus: 'synced',
  };
}

const PRE_ROWS: Row[] = [
  { key: 'A', correct: [1] },
  { key: 'B', correct: [1, 2] },
  { key: 'C', correct: [1, 3] },
  { key: 'D', correct: [1, 2, 3] },
  { key: 'E', correct: [] },
];

const POST_ROWS: Row[] = [
  { key: 'A', correct: [1, 2, 3] },
  { key: 'B', correct: [1, 3, 4] },
  { key: 'C', correct: [1, 2, 3, 4] },
  { key: 'D', correct: [1, 2, 3] },
  { key: 'E', correct: [1] },
];

const PRE = PRE_ROWS.map((row, i) => makeSubmission(row, 'pre', i));
const POST = POST_ROWS.map((row, i) => makeSubmission(row, 'post', i));

// ===========================================================================

describe('суурь статистик', () => {
  it('mean', () => {
    expect(mean([25, 50, 50, 75, 0])).toBe(40);
    expect(mean([])).toBe(0);
  });

  it('median — сондгой ба тэгш', () => {
    expect(median([25, 50, 50, 75, 0])).toBe(50);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('sampleSd (n−1 хуваагчтай)', () => {
    // [25,50,50,75,0]: дундаж 40, Σ(x−40)² = 3250, /4 = 812.5, √ = 28.5044
    expect(sampleSd([25, 50, 50, 75, 0])).toBeCloseTo(28.5044, 4);
    // [75,75,100,75,25]: дундаж 70, Σ = 3000, /4 = 750, √ = 27.3861
    expect(sampleSd([75, 75, 100, 75, 25])).toBeCloseTo(27.3861, 4);
  });

  it('sampleSd — n < 2 бол 0', () => {
    expect(sampleSd([])).toBe(0);
    expect(sampleSd([42])).toBe(0);
  });

  it('sampleSd — бүгд ижил утгатай бол 0', () => {
    expect(sampleSd([50, 50, 50, 50])).toBe(0);
  });
});

describe('groupStats', () => {
  it('pre бүлэг', () => {
    const stats = groupStats([25, 50, 50, 75, 0], 60);
    expect(stats).not.toBeNull();
    expect(stats!.n).toBe(5);
    expect(stats!.mean).toBe(40);
    expect(stats!.median).toBe(50);
    expect(stats!.sd).toBeCloseTo(28.5, 1);
    expect(stats!.min).toBe(0);
    expect(stats!.max).toBe(75);
    expect(stats!.passRate).toBe(20); // 1/5
  });

  it('post бүлэг', () => {
    const stats = groupStats([75, 75, 100, 75, 25], 60);
    expect(stats!.mean).toBe(70);
    expect(stats!.median).toBe(75);
    expect(stats!.passRate).toBe(80); // 4/5
  });

  it('хоосон түүвэрт null', () => {
    expect(groupStats([], 60)).toBeNull();
  });
});

describe('t-тархалт', () => {
  it('tCDF(0, df) = 0.5', () => {
    expect(tCDF(0, 5)).toBeCloseTo(0.5, 10);
    expect(tCDF(0, 100)).toBeCloseTo(0.5, 10);
  });

  it('tCDF тэгш хэмтэй', () => {
    expect(tCDF(1.5, 8) + tCDF(-1.5, 8)).toBeCloseTo(1, 10);
  });

  it('мэдэгдэж буй утгууд', () => {
    // t = 2.776445 · df = 4 → нэг талын 0.975
    expect(tCDF(2.776445, 4)).toBeCloseTo(0.975, 5);
    // t = 2.228139 · df = 10 → нэг талын 0.975
    expect(tCDF(2.228139, 10)).toBeCloseTo(0.975, 5);
    // Их df үед стандарт нормалд ойртоно: Φ(1.959964) ≈ 0.975
    expect(tCDF(1.959964, 100000)).toBeCloseTo(0.975, 4);
  });

  it('twoTailedPValue', () => {
    expect(twoTailedPValue(2.776445, 4)).toBeCloseTo(0.05, 5);
    expect(twoTailedPValue(0, 4)).toBeCloseTo(1, 10);
  });
});

describe('pairedTTest ба Cohen’s d', () => {
  // d = [50, 25, 50, 0, 25] → дундаж 30, Σ(d−30)² = 1750, /4 = 437.5, sd = 20.9165
  const diffs = [50, 25, 50, 0, 25];

  it('t статистик', () => {
    const result = pairedTTest(diffs);
    expect(result).not.toBeNull();
    // t = 30 / (20.9165 / √5) = 30 / 9.35414 = 3.20713
    expect(result!.t).toBeCloseTo(3.20713, 4);
    expect(result!.df).toBe(4);
  });

  it('p-утга (гараар бодсон 0.0326779)', () => {
    // I_x(2, 0.5), x = 4/(4+10.285714) = 0.28
    // ∫ = [2√u − (2/3)u^1.5] хилээр → 0.0435706 / B(2,0.5)=4/3 → 0.0326779
    const result = pairedTTest(diffs);
    expect(result!.p).toBeCloseTo(0.0326779, 6);
  });

  it("Cohen's d = 30 / 20.9165 = 1.43428", () => {
    expect(cohensDPaired(diffs)).toBeCloseTo(1.43428, 4);
  });

  it('үр нөлөөний тайлбар', () => {
    expect(effectSizeLabel(0.1)).toBe('маш бага');
    expect(effectSizeLabel(0.2)).toBe('бага');
    expect(effectSizeLabel(0.49)).toBe('бага');
    expect(effectSizeLabel(0.5)).toBe('дундаж');
    expect(effectSizeLabel(0.79)).toBe('дундаж');
    expect(effectSizeLabel(0.8)).toBe('их');
    expect(effectSizeLabel(-1.2)).toBe('их');
  });

  it('n < 2 бол null', () => {
    expect(pairedTTest([])).toBeNull();
    expect(pairedTTest([10])).toBeNull();
    expect(cohensDPaired([10])).toBeNull();
  });

  it('sd = 0 бол null (тэг хуваагч)', () => {
    expect(pairedTTest([10, 10, 10, 10])).toBeNull();
    expect(cohensDPaired([10, 10, 10, 10])).toBeNull();
    expect(pairedTTest([0, 0, 0])).toBeNull();
  });
});

describe('ахицын томьёо', () => {
  it('absoluteGain', () => {
    expect(absoluteGain(25, 75)).toBe(50);
    expect(absoluteGain(66.67, 58.33)).toBe(-8.34);
  });

  it('normalizedGain', () => {
    expect(normalizedGain(25, 75)).toBeCloseTo(0.6667, 4); // 50/75
    expect(normalizedGain(50, 100)).toBe(1);
    expect(normalizedGain(75, 75)).toBe(0);
    expect(normalizedGain(0, 25)).toBe(0.25);
  });

  it('pre = 100 бол normalizedGain нь null', () => {
    expect(normalizedGain(100, 100)).toBeNull();
    expect(normalizedGain(100, 90)).toBeNull();
  });

  it('hakeGain — бүлгийн дундаж дээр тооцно', () => {
    // (70 − 40) / (100 − 40) = 0.5
    expect(hakeGain([25, 50, 50, 75, 0], [75, 75, 100, 75, 25])).toBe(0.5);
  });

  it('hakeGain — pre дундаж 100 бол null', () => {
    expect(hakeGain([100, 100], [100, 100])).toBeNull();
  });

  it('categorize — хилийн утгууд', () => {
    expect(categorize(20, 50)).toBe('high'); // +30
    expect(categorize(20, 49.99)).toBe('medium'); // +29.99
    expect(categorize(20, 30)).toBe('medium'); // +10
    expect(categorize(20, 29.99)).toBe('low'); // +9.99
    expect(categorize(20, 20)).toBe('low'); // 0
    expect(categorize(20, 19.99)).toBe('declined');
    expect(categorize(40, null)).toBe('preOnly');
    expect(categorize(null, 40)).toBe('postOnly');
  });
});

describe('computeReportStats — жишиг өгөгдөл', () => {
  const stats = computeReportStats(FIXTURE_EXAM, PRE, POST);

  it('түүврийн хэмжээ', () => {
    expect(stats.nPre).toBe(5);
    expect(stats.nPost).toBe(5);
    expect(stats.nPaired).toBe(5);
    expect(stats.lowSampleWarning).toBe(false); // n = 5 нь босго дээр
  });

  it('бүлгийн статистик', () => {
    expect(stats.pre!.mean).toBe(40);
    expect(stats.pre!.median).toBe(50);
    expect(stats.pre!.sd).toBeCloseTo(28.5, 1);
    expect(stats.pre!.min).toBe(0);
    expect(stats.pre!.max).toBe(75);
    expect(stats.pre!.passRate).toBe(20);

    expect(stats.post!.mean).toBe(70);
    expect(stats.post!.median).toBe(75);
    expect(stats.post!.sd).toBeCloseTo(27.39, 2);
    expect(stats.post!.passRate).toBe(80);
  });

  it('ахиц', () => {
    expect(stats.meanAbsGain).toBe(30);
    expect(stats.hakeGain).toBe(0.5);
    // normGain: 0.6667 + 0.5 + 1 + 0 + 0.25 = 2.4167 / 5 = 0.48334
    expect(stats.meanNormGain).toBeCloseTo(0.4833, 3);
  });

  it('t / p / Cohen’s d', () => {
    expect(stats.tStat).toBeCloseTo(3.2071, 3);
    expect(stats.pValue).toBeCloseTo(0.0327, 4);
    expect(stats.cohenD).toBeCloseTo(1.4343, 3);
  });

  it('асуулт бүрийн ахиц', () => {
    const byOrder = new Map(stats.items.map((item) => [item.order, item]));
    expect(byOrder.get(1)).toMatchObject({ preCorrectPct: 80, postCorrectPct: 100, gain: 20 });
    expect(byOrder.get(2)).toMatchObject({ preCorrectPct: 40, postCorrectPct: 60, gain: 20 });
    expect(byOrder.get(3)).toMatchObject({ preCorrectPct: 40, postCorrectPct: 80, gain: 40 });
    expect(byOrder.get(4)).toMatchObject({ preCorrectPct: 0, postCorrectPct: 40, gain: 40 });
  });

  it('хамгийн их / бага сайжирсан 3 асуулт (тэнцвэл дараалалаар)', () => {
    expect(stats.topImproved.map((item) => item.order)).toEqual([3, 4, 1]);
    expect(stats.leastImproved.map((item) => item.order)).toEqual([1, 2, 3]);
  });

  it('сэдвийн ахиц', () => {
    expect(stats.topics).toEqual([
      { topic: TOPIC_B, gain: 40, nItems: 2 },
      { topic: TOPIC_A, gain: 20, nItems: 2 },
    ]);
  });

  it('ангилал', () => {
    expect(stats.categoryCounts).toEqual({
      high: 2, // A (+50), C (+50)
      medium: 2, // B (+25), E (+25)
      low: 1, // D (0)
      declined: 0,
      preOnly: 0,
      postOnly: 0,
    });
  });

  it('сурагчид absGain-аар буурахаар эрэмбэлэгдэнэ', () => {
    expect(stats.students.map((s) => s.absGain)).toEqual([50, 50, 25, 25, 0]);
  });

  it('дүгнэлт үүсгэнэ', () => {
    expect(stats.conclusions.overall).toContain('5 сурагчийн');
    expect(stats.conclusions.bestTopic).toContain(TOPIC_B);
    expect(stats.conclusions.weakTopic).toContain(TOPIC_A);
    expect(stats.conclusions.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(stats.conclusions.recommendations.length).toBeLessThanOrEqual(5);
  });
});

describe('computeReportStats — хилийн тохиолдол', () => {
  it('n = 0 (өгөгдөл огт байхгүй)', () => {
    const stats = computeReportStats(FIXTURE_EXAM, [], []);
    expect(stats.nPre).toBe(0);
    expect(stats.nPost).toBe(0);
    expect(stats.nPaired).toBe(0);
    expect(stats.pre).toBeNull();
    expect(stats.post).toBeNull();
    expect(stats.meanAbsGain).toBeNull();
    expect(stats.meanNormGain).toBeNull();
    expect(stats.hakeGain).toBeNull();
    expect(stats.tStat).toBeNull();
    expect(stats.pValue).toBeNull();
    expect(stats.cohenD).toBeNull();
    expect(stats.lowSampleWarning).toBe(true);
    expect(stats.students).toEqual([]);
    expect(stats.topics).toEqual([]);
    expect(stats.conclusions.overall).toContain('боломжгүй');
  });

  it('n = 1 — t/p/d нь null, ахиц тооцогдоно', () => {
    const stats = computeReportStats(FIXTURE_EXAM, [PRE[0]!], [POST[0]!]);
    expect(stats.nPaired).toBe(1);
    expect(stats.meanAbsGain).toBe(50);
    expect(stats.hakeGain).toBe(0.6667);
    expect(stats.tStat).toBeNull();
    expect(stats.pValue).toBeNull();
    expect(stats.cohenD).toBeNull();
    expect(stats.lowSampleWarning).toBe(true);
  });

  it('pre = 100 — normGain нь null, absGain хэвээр', () => {
    const perfect: Row = { key: 'P', correct: [1, 2, 3, 4] };
    const pre = [makeSubmission(perfect, 'pre', 0)];
    const post = [makeSubmission({ key: 'P', correct: [1, 2, 3] }, 'post', 0)];
    const stats = computeReportStats(FIXTURE_EXAM, pre, post);
    expect(stats.students[0]!.prePercent).toBe(100);
    expect(stats.students[0]!.postPercent).toBe(75);
    expect(stats.students[0]!.absGain).toBe(-25);
    expect(stats.students[0]!.normGain).toBeNull();
    expect(stats.students[0]!.category).toBe('declined');
    expect(stats.meanNormGain).toBeNull(); // цорын ганц сурагч хасагдсан
    expect(stats.hakeGain).toBeNull(); // pre дундаж = 100
  });

  it('бүгд ижил оноотой (sd = 0)', () => {
    const rows: Row[] = ['A', 'B', 'C', 'D'].map((key) => ({ key, correct: [1, 2] }));
    const pre = rows.map((row, i) => makeSubmission(row, 'pre', i));
    const post = rows.map((row, i) => makeSubmission({ ...row, correct: [1, 2, 3] }, 'post', i));
    const stats = computeReportStats(FIXTURE_EXAM, pre, post);

    expect(stats.pre!.sd).toBe(0);
    expect(stats.post!.sd).toBe(0);
    expect(stats.meanAbsGain).toBe(25);
    expect(stats.tStat).toBeNull(); // ялгааны sd = 0
    expect(stats.pValue).toBeNull();
    expect(stats.cohenD).toBeNull();
  });

  it('зөвхөн pre / зөвхөн post сурагчид', () => {
    const stats = computeReportStats(
      FIXTURE_EXAM,
      [makeSubmission({ key: 'X', correct: [1] }, 'pre', 0)],
      [makeSubmission({ key: 'Y', correct: [1, 2] }, 'post', 0)],
    );
    expect(stats.nPaired).toBe(0);
    expect(stats.categoryCounts.preOnly).toBe(1);
    expect(stats.categoryCounts.postOnly).toBe(1);
    expect(stats.meanAbsGain).toBeNull();
  });

  it('нэг сурагч давхар илгээвэл сүүлийнхийг авна', () => {
    const first = makeSubmission({ key: 'Z', correct: [1] }, 'post', 0);
    const second: Submission = {
      ...makeSubmission({ key: 'Z', correct: [1, 2, 3, 4] }, 'post', 1),
      submittedAt: '2026-02-01T00:00:00.000Z',
    };
    const stats = computeReportStats(FIXTURE_EXAM, [], [first, second]);
    expect(stats.nPost).toBe(1);
    expect(stats.post!.mean).toBe(100);
  });
});

describe('seed өгөгдөл', () => {
  const { exam, pre, post } = buildSeedDataset();
  const stats = computeReportStats(exam, pre, post);

  it('11 pre, 10 post, 9 хосолсон', () => {
    expect(pre).toHaveLength(11);
    expect(post).toHaveLength(10);
    expect(stats.nPaired).toBe(9);
  });

  it('шалгалт 10 асуулт, нийт 12 оноо', () => {
    expect(SEED_EXAM.questions).toHaveLength(10);
    expect(pre[0]!.maxScore).toBe(12);
  });

  it('асуултын төрлийн бүрдэл', () => {
    const counts = SEED_EXAM.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.type] = (acc[q.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ single: 4, multi: 2, truefalse: 2, short: 2 });
  });

  it('3 сэдэвтэй', () => {
    expect(stats.topics).toHaveLength(3);
  });

  it('ангилал бүрд дор хаяж 1 сурагч ноогдоно', () => {
    for (const [category, count] of Object.entries(stats.categoryCounts)) {
      expect(count, `"${category}" ангилал хоосон байна`).toBeGreaterThanOrEqual(1);
    }
  });

  it('статистик бүрэн тооцогдоно', () => {
    expect(stats.pre).not.toBeNull();
    expect(stats.post).not.toBeNull();
    expect(stats.meanAbsGain).not.toBeNull();
    expect(stats.hakeGain).not.toBeNull();
    expect(stats.tStat).not.toBeNull();
    expect(stats.pValue).not.toBeNull();
    expect(stats.cohenD).not.toBeNull();
    expect(stats.lowSampleWarning).toBe(false); // n = 9
  });

  it('дундаж дүн өссөн байна', () => {
    expect(stats.post!.mean).toBeGreaterThan(stats.pre!.mean);
    expect(stats.meanAbsGain!).toBeGreaterThan(0);
  });
});
