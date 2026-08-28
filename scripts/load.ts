/**
 * Ачааллын тест — `pnpm load`
 *
 * 30 зэрэгцээ илгээлт явуулж бүгд 200/201 буцаж байгаа эсэх, p95 < 1 сек эсэхийг
 * шалгана (даалгаврын хүлээн авах шалгуур).
 *
 * Хэрэглээ:
 *   pnpm load                       # 30 зэрэгцээ, localhost:3000
 *   pnpm load -- --n 100 --url http://192.168.1.42:3000
 */

import { computeStudentKey } from '../packages/shared/src/index';

interface Options {
  baseUrl: string;
  count: number;
  keepExam: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseUrl: process.env.LOAD_URL ?? 'http://localhost:3000',
    count: 30,
    keepExam: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--url' && argv[i + 1]) options.baseUrl = argv[++i]!;
    else if (flag === '--n' && argv[i + 1]) options.count = Number(argv[++i]);
    else if (flag === '--keep') options.keepExam = true;
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, '');
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new Error('--n нь эерэг бүхэл тоо байх ёстой');
  }
  return options;
}

const QUESTION_COUNT = 10;

function buildExamPayload() {
  return {
    title: `Ачааллын тест ${new Date().toISOString()}`,
    subject: 'Тест',
    teacherName: 'Ачааллын скрипт',
    teacherEmail: 'load@example.mn',
    examDate: new Date().toISOString().slice(0, 10),
    deliveryMode: 'online',
    passThreshold: 60,
    shuffle: false,
    showAnswersToStudent: true,
    onePerPage: false,
    status: 'active',
    questions: Array.from({ length: QUESTION_COUNT }, (_, index) => ({
      order: index + 1,
      type: 'single',
      text: `Ачааллын тестийн ${index + 1}-р асуулт`,
      options: [
        { id: 'A', text: 'Зөв хариулт' },
        { id: 'B', text: 'Буруу хариулт' },
        { id: 'C', text: 'Бас буруу' },
      ],
      correctOptionIds: ['A'],
      points: 1,
      topic: `Сэдэв ${(index % 3) + 1}`,
    })),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.info('');
  console.info('  Ачааллын тест');
  console.info(`    Сервер          : ${options.baseUrl}`);
  console.info(`    Зэрэгцээ илгээлт: ${options.count}`);
  console.info('');

  // --- 0. Сервер амьд эсэх ---
  try {
    const health = await fetch(`${options.baseUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
  } catch (error) {
    console.error(`  ✖ Сервер хүрэхгүй байна: ${error instanceof Error ? error.message : error}`);
    console.error('    `pnpm dev:api` эсвэл `pnpm lan` ажиллуулсан эсэхээ шалгана уу.');
    process.exit(1);
  }

  // --- 1. Шалгалт үүсгэх ---
  const createResponse = await fetch(`${options.baseUrl}/api/exams`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildExamPayload()),
  });

  if (!createResponse.ok) {
    console.error(`  ✖ Шалгалт үүсгэж чадсангүй: HTTP ${createResponse.status}`);
    console.error(await createResponse.text());
    process.exit(1);
  }

  const { exam } = (await createResponse.json()) as {
    exam: { id: string; teacherToken: string; questions: { id: string; order: number }[] };
  };
  const questionIds = exam.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => question.id);

  console.info(`  ✔ Шалгалт үүслээ: ${exam.id}`);

  // --- 2. N зэрэгцээ илгээлт ---
  interface Result {
    status: number;
    ms: number;
    error?: string;
  }

  const startedAt = new Date().toISOString();

  const send = async (index: number): Promise<Result> => {
    // Сурагч тус бүр өөр тооны зөв хариулттай
    const correctCount = index % (QUESTION_COUNT + 1);
    const answers = questionIds.map((questionId, position) => ({
      questionId,
      value: position < correctCount ? 'A' : 'B',
    }));

    const lastName = `Овог${String(index).padStart(3, '0')}`;
    const firstName = `Нэр${String(index).padStart(3, '0')}`;
    const className = `8${['а', 'б', 'в'][index % 3]}`;

    const body = {
      mode: 'pre',
      lastName,
      firstName,
      className,
      studentKey: computeStudentKey(lastName, firstName, className),
      answers,
      startedAt,
      submittedAt: new Date().toISOString(),
      durationSec: 300 + index,
      deviceId: `load-${index}`,
      source: 'online',
    };

    const begin = performance.now();
    try {
      const response = await fetch(`${options.baseUrl}/api/exams/${exam.id}/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const ms = performance.now() - begin;
      if (!response.ok) {
        return { status: response.status, ms, error: (await response.text()).slice(0, 200) };
      }
      return { status: response.status, ms };
    } catch (error) {
      return {
        status: 0,
        ms: performance.now() - begin,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const wallStart = performance.now();
  const results = await Promise.all(
    Array.from({ length: options.count }, (_, index) => send(index)),
  );
  const wallMs = performance.now() - wallStart;

  // --- 3. Дүн ---
  const ok = results.filter((result) => result.status === 200 || result.status === 201);
  const failed = results.filter((result) => result.status !== 200 && result.status !== 201);
  const durations = results.map((result) => result.ms);

  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);
  const max = Math.max(...durations);

  console.info('');
  console.info('  ── ҮР ДҮН ────────────────────────────');
  console.info(`    Амжилттай (200/201) : ${ok.length} / ${results.length}`);
  console.info(`    Амжилтгүй           : ${failed.length}`);
  console.info(`    Нийт хугацаа        : ${wallMs.toFixed(0)} мс`);
  console.info(`    p50                 : ${p50.toFixed(0)} мс`);
  console.info(`    p95                 : ${p95.toFixed(0)} мс`);
  console.info(`    p99                 : ${p99.toFixed(0)} мс`);
  console.info(`    Хамгийн удаан       : ${max.toFixed(0)} мс`);
  console.info('');

  if (failed.length > 0) {
    console.error('  Амжилтгүй хүсэлтүүд (эхний 5):');
    for (const result of failed.slice(0, 5)) {
      console.error(`    HTTP ${result.status} — ${result.error ?? ''}`);
    }
    console.info('');
  }

  // --- 4. Сервер дээр бодитоор хадгалагдсан эсэх ---
  const listResponse = await fetch(
    `${options.baseUrl}/api/exams/${exam.id}/submissions?t=${encodeURIComponent(exam.teacherToken)}`,
  );
  const list = (await listResponse.json()) as { submissions: unknown[] };
  console.info(`    Серверт хадгалагдсан: ${list.submissions.length}`);
  console.info('');

  // --- 5. Шалгуур ---
  const allOk = failed.length === 0;
  const fastEnough = p95 < 1000;
  const stored = list.submissions.length === options.count;

  console.info('  ── ШАЛГУУР ───────────────────────────');
  console.info(`    ${allOk ? '✔' : '✖'} Бүгд 200/201`);
  console.info(`    ${fastEnough ? '✔' : '✖'} p95 < 1000 мс (${p95.toFixed(0)} мс)`);
  console.info(`    ${stored ? '✔' : '✖'} Бүх илгээлт хадгалагдсан`);
  console.info('');

  if (!options.keepExam) {
    console.info(`  Тестийн шалгалт: ${options.baseUrl}/teacher/${exam.id}?t=${exam.teacherToken}`);
    console.info('  (Устгахгүй үлдээв — `--keep` тугийг үл харгалзан гараар устгана уу.)');
    console.info('');
  }

  process.exit(allOk && fastEnough && stored ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('[load] Алдаа:', error);
  process.exit(1);
});
