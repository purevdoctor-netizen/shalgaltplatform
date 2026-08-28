/**
 * Өмнөх/дараах шалгалтын статистик анализ.
 *
 * Бүх хувийн утга 0–100 масштабтай (percentage point).
 * Гадаад статистикийн сан ашиглахгүй — `tCDF`-ийг энд хэрэгжүүлсэн
 * (ASSUMPTIONS A-06).
 */

import type {
  EffectSizeLabel,
  Exam,
  GroupStats,
  ItemStat,
  Question,
  ReportStats,
  StudentResult,
  Submission,
} from './types';
import { isCorrect, roundTo } from './scoring';

// ---------------------------------------------------------------------------
// 1. Тайлбар суурь статистик
// ---------------------------------------------------------------------------

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Түүврийн стандарт хазайлт (n−1 хуваагчтай). n < 2 бол 0. */
export function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (const value of values) {
    const diff = value - m;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

/** Бүлгийн нэгдсэн үзүүлэлт. Хоосон түүвэрт `null`. */
export function groupStats(percents: readonly number[], passThreshold: number): GroupStats | null {
  if (percents.length === 0) return null;
  const passed = percents.filter((p) => p >= passThreshold).length;
  return {
    n: percents.length,
    mean: roundTo(mean(percents), 2),
    median: roundTo(median(percents), 2),
    sd: roundTo(sampleSd(percents), 2),
    min: roundTo(Math.min(...percents), 2),
    max: roundTo(Math.max(...percents), 2),
    passRate: roundTo((passed / percents.length) * 100, 2),
  };
}

// ---------------------------------------------------------------------------
// 2. Student t-тархалт
// ---------------------------------------------------------------------------

/** Lanczos ойролцоолол — ln Γ(x). */
function logGamma(x: number): number {
  // prettier-ignore
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = coefficients[0]!;
  const t = z + 7.5;
  for (let i = 1; i < coefficients.length; i++) {
    a += coefficients[i]! / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Бүрэн бус бета функцийн үргэлжилсэн бутархай (Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 3e-16;
  const TINY = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;

    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;

    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/** Регуляржуулсан бүрэн бус бета функц I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Student t-тархалтын хуримтлагдсан тархалтын функц P(T ≤ t). */
export function tCDF(t: number, df: number): number {
  if (df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Хоёр талт p-утга: 2·(1 − P(T ≤ |t|)) = I_x(df/2, 1/2). */
export function twoTailedPValue(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return Number.NaN;
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export interface PairedTTestResult {
  t: number;
  df: number;
  p: number;
}

/**
 * Хосолсон t-шалгуур.
 *
 * ASSUMPTION: `sd(d) === 0` үед t нь математикийн хувьд ±∞ (эсвэл 0/0)
 * болох тул `null` буцаана — тайланд "N/A" гэж харагдана.
 */
export function pairedTTest(diffs: readonly number[]): PairedTTestResult | null {
  const n = diffs.length;
  if (n < 2) return null;
  const sd = sampleSd(diffs);
  if (sd === 0) return null;
  const t = mean(diffs) / (sd / Math.sqrt(n));
  const df = n - 1;
  return { t, df, p: twoTailedPValue(t, df) };
}

/** Хосолсон Cohen's d = mean(d) / sd(d). sd = 0 эсвэл n < 2 бол `null`. */
export function cohensDPaired(diffs: readonly number[]): number | null {
  if (diffs.length < 2) return null;
  const sd = sampleSd(diffs);
  if (sd === 0) return null;
  return mean(diffs) / sd;
}

/** |d| < 0.2 маш бага · < 0.5 бага · < 0.8 дундаж · ≥ 0.8 их */
export function effectSizeLabel(d: number): EffectSizeLabel {
  const abs = Math.abs(d);
  if (abs < 0.2) return 'маш бага';
  if (abs < 0.5) return 'бага';
  if (abs < 0.8) return 'дундаж';
  return 'их';
}

// ---------------------------------------------------------------------------
// 3. Ахицын тооцоо
// ---------------------------------------------------------------------------

/** Абсолют ахиц (percentage point). */
export function absoluteGain(prePercent: number, postPercent: number): number {
  return roundTo(postPercent - prePercent, 2);
}

/**
 * Нормчлогдсон ахиц (Hake) нэг сурагчид.
 *
 * ASSUMPTION: `prePercent === 100` үед хуваагч 0 болох тул `null` буцаана.
 * `meanNormGain` тооцоолохдоо ийм сурагчдыг ХАСНА (1.0 гэж үзвэл дээд
 * түвшний сурагчид бүлгийн дундажийг зохиомлоор өсгөнө).
 */
export function normalizedGain(prePercent: number, postPercent: number): number | null {
  if (prePercent >= 100) return null;
  return roundTo((postPercent - prePercent) / (100 - prePercent), 4);
}

/** Бүлгийн Hake gain: `<g> = (mean(post) − mean(pre)) / (100 − mean(pre))`. */
export function hakeGain(
  prePercents: readonly number[],
  postPercents: readonly number[],
): number | null {
  if (prePercents.length === 0 || postPercents.length === 0) return null;
  const preMean = mean(prePercents);
  if (preMean >= 100) return null;
  return roundTo((mean(postPercents) - preMean) / (100 - preMean), 4);
}

/** Сурагчийн ангилал `absGain`-аар (percentage point). */
export function categorize(
  prePercent: number | null,
  postPercent: number | null,
): StudentResult['category'] {
  if (prePercent === null && postPercent === null) return 'preOnly';
  if (postPercent === null) return 'preOnly';
  if (prePercent === null) return 'postOnly';
  const gain = postPercent - prePercent;
  if (gain < 0) return 'declined';
  if (gain >= 30) return 'high';
  if (gain >= 10) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// 4. Гол функц — бүрэн тайлангийн статистик
// ---------------------------------------------------------------------------

const EMPTY_CATEGORY_COUNTS: Record<StudentResult['category'], number> = {
  high: 0,
  medium: 0,
  low: 0,
  declined: 0,
  preOnly: 0,
  postOnly: 0,
};

/** Нэг горимын хамгийн сүүлийн илгээлтийг сурагч тус бүрээр авна. */
function latestByStudent(submissions: readonly Submission[]): Map<string, Submission> {
  const map = new Map<string, Submission>();
  for (const submission of submissions) {
    const existing = map.get(submission.studentKey);
    if (!existing || submission.submittedAt > existing.submittedAt) {
      map.set(submission.studentKey, submission);
    }
  }
  return map;
}

/** Тухайн асуултад зөв хариулсан сурагчдын хувь (0–100). Түүвэр хоосон бол `null`. */
function correctPercentForQuestion(
  question: Question,
  submissions: readonly Submission[],
): number | null {
  if (submissions.length === 0) return null;
  let correct = 0;
  for (const submission of submissions) {
    const answer = submission.answers.find((a) => a.questionId === question.id);
    if (isCorrect(question, answer ? answer.value : null)) correct++;
  }
  return roundTo((correct / submissions.length) * 100, 2);
}

/**
 * Бүх статистикийг нэг дор тооцоолно.
 *
 * @param exam   Асуулт, оноо, тэнцэх босгыг агуулсан шалгалт
 * @param pre    ӨМНӨХ горимд өгсөн БҮХ илгээлт
 * @param post   ДАРААХ горимд өгсөн БҮХ илгээлт
 */
export function computeReportStats(
  exam: Exam,
  pre: readonly Submission[],
  post: readonly Submission[],
): ReportStats {
  const questions = exam.questions.slice().sort((a, b) => a.order - b.order);
  const preByKey = latestByStudent(pre);
  const postByKey = latestByStudent(post);

  const preList = [...preByKey.values()];
  const postList = [...postByKey.values()];

  // --- Бүлгийн статистик (тухайн горимд өгсөн БҮХ сурагчаар) ---
  const prePercents = preList.map((s) => s.percent);
  const postPercents = postList.map((s) => s.percent);
  const preStats = groupStats(prePercents, exam.passThreshold);
  const postStats = groupStats(postPercents, exam.passThreshold);

  // --- Сурагч тус бүрийн үр дүн ---
  const allKeys = new Set<string>([...preByKey.keys(), ...postByKey.keys()]);
  const students: StudentResult[] = [];

  for (const key of allKeys) {
    const preSub = preByKey.get(key);
    const postSub = postByKey.get(key);
    const identity = postSub ?? preSub;
    if (!identity) continue;

    const prePercent = preSub ? preSub.percent : null;
    const postPercent = postSub ? postSub.percent : null;
    const bothPresent = prePercent !== null && postPercent !== null;

    students.push({
      studentKey: key,
      lastName: identity.lastName,
      firstName: identity.firstName,
      className: identity.className,
      prePercent,
      postPercent,
      absGain: bothPresent ? absoluteGain(prePercent, postPercent) : null,
      normGain: bothPresent ? normalizedGain(prePercent, postPercent) : null,
      category: categorize(prePercent, postPercent),
    });
  }

  // absGain-аар буурахаар, "Зөвхөн pre/post" төгсгөлд
  students.sort((a, b) => {
    const aPaired = a.absGain !== null;
    const bPaired = b.absGain !== null;
    if (aPaired !== bPaired) return aPaired ? -1 : 1;
    if (aPaired && bPaired) return b.absGain! - a.absGain!;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'mn');
  });

  const paired = students.filter((s) => s.absGain !== null);
  const nPaired = paired.length;

  // --- Ахиц ---
  const diffs = paired.map((s) => s.postPercent! - s.prePercent!);
  const meanAbsGain = nPaired > 0 ? roundTo(mean(diffs), 2) : null;

  const normGains = paired.map((s) => s.normGain).filter((g): g is number => g !== null);
  const meanNormGain = normGains.length > 0 ? roundTo(mean(normGains), 4) : null;

  const gain =
    nPaired > 0
      ? hakeGain(
          paired.map((s) => s.prePercent!),
          paired.map((s) => s.postPercent!),
        )
      : null;

  const tTest = pairedTTest(diffs);
  const cohenD = cohensDPaired(diffs);

  // --- Асуулт бүрийн статистик ---
  const items: ItemStat[] = questions.map((question) => {
    const preCorrectPct = correctPercentForQuestion(question, preList);
    const postCorrectPct = correctPercentForQuestion(question, postList);
    const item: ItemStat = {
      questionId: question.id,
      order: question.order,
      preCorrectPct,
      postCorrectPct,
      gain:
        preCorrectPct !== null && postCorrectPct !== null
          ? roundTo(postCorrectPct - preCorrectPct, 2)
          : null,
    };
    if (question.topic !== undefined) item.topic = question.topic;
    return item;
  });

  const measurable = items.filter((item) => item.gain !== null);
  const topImproved = measurable
    .slice()
    .sort((a, b) => b.gain! - a.gain! || a.order - b.order)
    .slice(0, 3);
  const leastImproved = measurable
    .slice()
    .sort((a, b) => a.gain! - b.gain! || a.order - b.order)
    .slice(0, 3);

  // --- Сэдвийн статистик (асуултын оноогоор жигнэсэн дундаж) ---
  const pointsById = new Map(questions.map((q) => [q.id, q.points]));
  const topicBuckets = new Map<string, { weighted: number; weight: number; nItems: number }>();
  for (const item of items) {
    if (item.topic === undefined || item.topic === '' || item.gain === null) continue;
    const weight = pointsById.get(item.questionId) ?? 1;
    const bucket = topicBuckets.get(item.topic) ?? { weighted: 0, weight: 0, nItems: 0 };
    bucket.weighted += item.gain * weight;
    bucket.weight += weight;
    bucket.nItems += 1;
    topicBuckets.set(item.topic, bucket);
  }
  const topics = [...topicBuckets.entries()]
    .map(([topic, bucket]) => ({
      topic,
      gain: bucket.weight > 0 ? roundTo(bucket.weighted / bucket.weight, 2) : 0,
      nItems: bucket.nItems,
    }))
    .sort((a, b) => b.gain - a.gain);

  // --- Ангиллын тоо ---
  const categoryCounts = { ...EMPTY_CATEGORY_COUNTS };
  for (const student of students) {
    categoryCounts[student.category] += 1;
  }

  const lowSampleWarning = nPaired < 5;

  const stats: ReportStats = {
    nPre: preList.length,
    nPost: postList.length,
    nPaired,
    pre: preStats,
    post: postStats,
    meanAbsGain,
    meanNormGain,
    hakeGain: gain,
    tStat: tTest ? roundTo(tTest.t, 4) : null,
    pValue: tTest ? roundTo(tTest.p, 6) : null,
    cohenD: cohenD !== null ? roundTo(cohenD, 4) : null,
    lowSampleWarning,
    items,
    topImproved,
    leastImproved,
    topics,
    students,
    categoryCounts,
    conclusions: {
      overall: '',
      bestTopic: '',
      weakTopic: '',
      attentionStudents: '',
      recommendations: [],
    },
  };

  stats.conclusions = buildConclusions(exam, stats);
  return stats;
}

// ---------------------------------------------------------------------------
// 5. Автомат дүгнэлт (монголоор, template + тоо)
// ---------------------------------------------------------------------------

function formatPercent(value: number | null): string {
  return value === null ? 'мэдээлэлгүй' : `${roundTo(value, 2).toFixed(2)}%`;
}

function formatSigned(value: number | null): string {
  if (value === null) return 'мэдээлэлгүй';
  const rounded = roundTo(value, 2);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)}`;
}

function questionLabel(item: ItemStat): string {
  const topic = item.topic ? ` (${item.topic})` : '';
  return `№${item.order}${topic}`;
}

/** Тайлангийн текст дүгнэлтүүдийг үүсгэнэ. */
export function buildConclusions(exam: Exam, stats: ReportStats): ReportStats['conclusions'] {
  const { nPaired, pre, post, meanAbsGain, hakeGain: gain, cohenD, pValue } = stats;

  // --- Ерөнхий үр дүн ---
  const sentences: string[] = [];
  if (nPaired === 0) {
    sentences.push(
      'Өмнөх болон дараах шалгалтыг хоёуланг нь өгсөн сурагч байхгүй тул ахицын харьцуулалт хийх боломжгүй байна.',
    );
  } else {
    sentences.push(
      `${nPaired} сурагчийн өмнөх ба дараах дүнг харьцуулахад дундаж оноо ` +
        `${formatPercent(pre?.mean ?? null)}-аас ${formatPercent(post?.mean ?? null)} болж, ` +
        `дунджаар ${formatSigned(meanAbsGain)} нэгжээр өөрчлөгдсөн байна.`,
    );
    const parts: string[] = [];
    if (gain !== null) parts.push(`Хейкийн нормчлогдсон ахиц <g> = ${gain.toFixed(3)}`);
    if (cohenD !== null) {
      parts.push(`Cohen's d = ${cohenD.toFixed(2)} (${effectSizeLabel(cohenD)} үр нөлөө)`);
    }
    if (pValue !== null) {
      const significance =
        pValue < 0.05 ? 'статистик ач холбогдолтой' : 'статистик ач холбогдолгүй';
      parts.push(`p = ${pValue < 0.0001 ? '<0.0001' : pValue.toFixed(4)} — ${significance}`);
    }
    if (parts.length > 0) sentences.push(`${parts.join('; ')}.`);
  }
  if (stats.lowSampleWarning && nPaired > 0) {
    sentences.push('Түүвэр бага тул статистик найдвартай бишийг анхаарна уу.');
  }

  // --- Хамгийн сайн / сул сэдэв ---
  const best = stats.topics[0];
  const weak = stats.topics[stats.topics.length - 1];
  const bestItem = stats.topImproved[0];
  const weakItem = stats.leastImproved[0];

  const bestTopic =
    best && stats.topics.length > 0
      ? `Хамгийн сайн ахиц: "${best.topic}" сэдэв (${formatSigned(best.gain)} нэгж, ` +
        `${best.nItems} асуулт)` +
        (bestItem
          ? `, тухайлбал ${questionLabel(bestItem)} асуулт ${formatSigned(bestItem.gain)} нэгжээр сайжирсан.`
          : '.')
      : bestItem
        ? `Хамгийн сайн ахиц: ${questionLabel(bestItem)} асуулт ${formatSigned(bestItem.gain)} нэгжээр сайжирсан.`
        : 'Сэдвийн ахиц тооцоолох хангалттай өгөгдөл алга.';

  const weakTopic =
    weak && stats.topics.length > 1
      ? `Дахин тайлбарлах шаардлагатай: "${weak.topic}" сэдэв (${formatSigned(weak.gain)} нэгж, ` +
        `${weak.nItems} асуулт)` +
        (weakItem ? `, ялангуяа ${questionLabel(weakItem)} асуулт.` : '.')
      : weakItem
        ? `Дахин тайлбарлах шаардлагатай: ${questionLabel(weakItem)} асуулт (${formatSigned(weakItem.gain)} нэгж).`
        : 'Сул сэдэв тодорхойлох хангалттай өгөгдөл алга.';

  // --- Анхаарах сурагчид ---
  const attention = stats.students.filter(
    (s) =>
      s.category === 'declined' || (s.postPercent !== null && s.postPercent < exam.passThreshold),
  );
  const attentionStudents =
    attention.length === 0
      ? 'Тусгайлан анхаарах шаардлагатай сурагч илрээгүй.'
      : `Анхаарал шаардсан ${attention.length} сурагч: ` +
        attention
          .slice(0, 12)
          .map(
            (s) =>
              `${s.lastName} ${s.firstName} (${s.className}, ` +
              `${formatPercent(s.prePercent)} → ${formatPercent(s.postPercent)})`,
          )
          .join('; ') +
        (attention.length > 12 ? ` ба бусад ${attention.length - 12}.` : '.');

  // --- Зөвлөмж (3–5) ---
  const recommendations: string[] = [];

  if (weakItem && weakItem.gain !== null && weakItem.gain < 10) {
    recommendations.push(
      `${questionLabel(weakItem)} асуултын агуулгыг дахин тайлбарлаж, ижил төрлийн дасгал өгөх.`,
    );
  }
  if (weak && stats.topics.length > 1 && weak.gain < (best?.gain ?? 0)) {
    recommendations.push(
      `"${weak.topic}" сэдвээр нэмэлт давтлага зохион байгуулж, бодит жишээ дээр тулгуурласан даалгавар өгөх.`,
    );
  }
  if (stats.categoryCounts.declined > 0) {
    recommendations.push(
      `Дүн буурсан ${stats.categoryCounts.declined} сурагчтай ганцаарчилсан ярилцлага хийж, ` +
        'бэрхшээлийн шалтгааныг тодруулах.',
    );
  }
  if (post && post.passRate < 60) {
    recommendations.push(
      `Тэнцсэн хувь ${formatPercent(post.passRate)} байгаа тул дараагийн хичээлээр суурь ойлголтыг ` +
        'бататгах давталт хийх.',
    );
  }
  if (stats.lowSampleWarning) {
    recommendations.push(
      'Түүврийг нэмэгдүүлэх — өмнөх эсвэл дараах шалгалт өгөөгүй сурагчдаас нөхөж авах.',
    );
  }
  if (stats.categoryCounts.preOnly > 0) {
    recommendations.push(
      `Дараах шалгалт өгөөгүй ${stats.categoryCounts.preOnly} сурагчаас нөхөн авч ахицыг бүрэн хэмжих.`,
    );
  }
  if (best && best.gain > 0) {
    recommendations.push(
      `"${best.topic}" сэдэвт хэрэглэсэн заах аргыг бусад сэдэвт дэлгэрүүлэн ашиглах.`,
    );
  }
  // Даалгаврын шаардлага: зөвлөмж ҮРГЭЛЖ 3–5 байна. Дутвал ерөнхий
  // зөвлөмжөөр нөхнө (давхардуулахгүй).
  const FALLBACK_RECOMMENDATIONS = [
    'Одоогийн заах арга үр дүнгээ өгч байна — ижил хэлбэрээр үргэлжлүүлэх.',
    'Дараагийн сэдвээр мөн адил өмнөх/дараах хэмжилт хийж чиг хандлагыг ажиглах.',
    'Өндөр ахицтай сурагчдад гүнзгийрүүлсэн нэмэлт даалгавар өгөх.',
    'Буруу хариулт түгээмэл байсан асуултуудыг ангид хамтдаа задлан шинжлэх.',
  ];
  for (const fallback of FALLBACK_RECOMMENDATIONS) {
    if (recommendations.length >= 3) break;
    if (!recommendations.includes(fallback)) recommendations.push(fallback);
  }

  return {
    overall: sentences.join(' '),
    bestTopic,
    weakTopic,
    attentionStudents,
    // 3–5 зөвлөмж
    recommendations: recommendations.slice(0, 5),
  };
}
