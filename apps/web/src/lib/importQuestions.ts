/**
 * Excel (.xlsx) / CSV импорт-экспорт.
 *
 * Баганын дараалал:
 *   type, text, optionA, optionB, optionC, optionD, optionE, optionF,
 *   correct, points, topic
 *
 * `correct` багана:
 *   single / truefalse → `A`
 *   multi              → `A;C`
 *   short              → `хариулт1,хариулт2`   (таслалтай хариултыг "…" дотор)
 */

import * as XLSX from 'xlsx';
import type { QuestionType } from '@shalgalt/shared';
import { FALSE_OPTION_ID, TRUE_OPTION_ID } from '@shalgalt/shared';
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  OPTION_IDS,
  createDraftQuestion,
  parseAcceptedAnswers,
  type DraftQuestion,
} from './examDraft';
import { downloadBlob } from './utils';

export const IMPORT_COLUMNS = [
  'type',
  'text',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'optionE',
  'optionF',
  'correct',
  'points',
  'topic',
] as const;

export interface ImportRowError {
  /** Хүснэгтийн мөрийн дугаар (толгой = 1). */
  row: number;
  message: string;
}

export interface ImportResult {
  questions: DraftQuestion[];
  errors: ImportRowError[];
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  single: 'single',
  multi: 'multi',
  multiple: 'multi',
  truefalse: 'truefalse',
  'true/false': 'truefalse',
  tf: 'truefalse',
  short: 'short',
  text: 'short',
  // Монгол нэршил
  'нэг зөв': 'single',
  'олон зөв': 'multi',
  'үнэн/худал': 'truefalse',
  богино: 'short',
};

function cell(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const HEADER_ALIASES: Record<string, string> = {
  type: 'type',
  төрөл: 'type',
  text: 'text',
  question: 'text',
  асуулт: 'text',
  optiona: 'optionA',
  'option a': 'optionA',
  a: 'optionA',
  optionb: 'optionB',
  'option b': 'optionB',
  b: 'optionB',
  optionc: 'optionC',
  'option c': 'optionC',
  c: 'optionC',
  optiond: 'optionD',
  'option d': 'optionD',
  d: 'optionD',
  optione: 'optionE',
  'option e': 'optionE',
  e: 'optionE',
  optionf: 'optionF',
  'option f': 'optionF',
  f: 'optionF',
  correct: 'correct',
  answer: 'correct',
  'зөв хариулт': 'correct',
  points: 'points',
  оноо: 'points',
  topic: 'topic',
  сэдэв: 'topic',
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [HEADER_ALIASES[normalizeHeader(key)] ?? key, value]),
  );
}

function parseType(raw: string): QuestionType | null {
  return TYPE_ALIASES[raw.toLowerCase()] ?? null;
}

function parseRow(row: Record<string, unknown>, rowNumber: number): DraftQuestion | ImportRowError {
  const rawType = cell(row, 'type');
  if (rawType === '') return { row: rowNumber, message: '`type` багана хоосон байна' };

  const type = parseType(rawType);
  if (!type) {
    return {
      row: rowNumber,
      message: `"${rawType}" гэсэн төрөл танигдахгүй (single, multi, truefalse, short)`,
    };
  }

  const text = cell(row, 'text');
  if (text === '') return { row: rowNumber, message: '`text` багана хоосон байна' };

  const rawPoints = cell(row, 'points');
  const points = rawPoints === '' ? 1 : Number(rawPoints);
  if (!Number.isFinite(points) || points <= 0) {
    return { row: rowNumber, message: '`points` нь 0-ээс их тоо байх ёстой' };
  }
  if (Math.round(points * 2) !== points * 2) {
    return { row: rowNumber, message: '`points` нь 0.5-ийн алхамтай байх ёстой' };
  }

  const question = createDraftQuestion(type);
  question.text = text;
  question.points = points;
  question.topic = cell(row, 'topic');

  const correct = cell(row, 'correct');

  if (type === 'short') {
    if (correct === '') {
      return { row: rowNumber, message: '`correct` баганад хүлээн зөвшөөрөх хариултыг бичнэ үү' };
    }
    question.acceptedAnswers = correct;
    if (parseAcceptedAnswers(correct).length === 0) {
      return { row: rowNumber, message: '`correct` баганаас хариулт салгаж чадсангүй' };
    }
    question.options = [];
    question.correctOptionIds = [];
    return question;
  }

  if (type === 'truefalse') {
    const upper = correct.toUpperCase();
    const id =
      upper === 'A' || upper === 'ҮНЭН' || upper === 'TRUE'
        ? TRUE_OPTION_ID
        : upper === 'B' || upper === 'ХУДАЛ' || upper === 'FALSE'
          ? FALSE_OPTION_ID
          : null;
    if (!id) {
      return { row: rowNumber, message: '`correct` нь A (Үнэн) эсвэл B (Худал) байх ёстой' };
    }
    question.correctOptionIds = [id];
    return question;
  }

  // single / multi
  const options = OPTION_IDS.map((id) => ({ id, text: cell(row, `option${id}`) })).filter(
    (option) => option.text !== '',
  );

  if (options.length < MIN_OPTIONS) {
    return { row: rowNumber, message: `Дор хаяж ${MIN_OPTIONS} сонголт шаардлагатай` };
  }
  if (options.length > MAX_OPTIONS) {
    return { row: rowNumber, message: `Хамгийн ихдээ ${MAX_OPTIONS} сонголт` };
  }

  const validIds = new Set<string>(options.map((option) => option.id));
  const correctIds = correct
    .split(';')
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part !== '');

  if (correctIds.length === 0) {
    return { row: rowNumber, message: '`correct` багана хоосон байна' };
  }
  for (const id of correctIds) {
    if (!validIds.has(id)) {
      return { row: rowNumber, message: `"${id}" гэсэн сонголт энэ мөрөнд байхгүй` };
    }
  }
  if (type === 'single' && correctIds.length > 1) {
    return { row: rowNumber, message: '`single` төрөлд зөвхөн нэг зөв хариулт байна' };
  }

  question.options = options;
  question.correctOptionIds = [...new Set(correctIds)];
  return question;
}

function isError(value: DraftQuestion | ImportRowError): value is ImportRowError {
  return 'row' in value && 'message' in value;
}

/** Файлыг уншиж асуулт болгоно. Алдаатай мөрийг алгасаж, тусад нь мэдээлнэ. */
export async function importQuestionsFromFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { questions: [], errors: [{ row: 0, message: 'Хүснэгт хоосон байна' }] };

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { questions: [], errors: [{ row: 0, message: 'Хүснэгт хоосон байна' }] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const questions: DraftQuestion[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow);
    // Толгой мөр 1 тул өгөгдлийн мөр 2-оос эхэлнэ
    const rowNumber = index + 2;

    // Бүрэн хоосон мөрийг чимээгүй алгасна
    const hasContent = IMPORT_COLUMNS.some((column) => cell(row, column) !== '');
    if (!hasContent) return;

    const parsed = parseRow(row, rowNumber);
    if (isError(parsed)) errors.push(parsed);
    else questions.push(parsed);
  });

  return { questions, errors };
}

/** Загварын файл татах. */
export function downloadImportTemplate(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const rows: Record<string, string | number>[] = [
    {
      type: 'single',
      text: '3/4 бутархайг аравтын бутархай болгоход хэд гарах вэ?',
      optionA: '0.75',
      optionB: '0.34',
      optionC: '1.33',
      optionD: '0.43',
      optionE: '',
      optionF: '',
      correct: 'A',
      points: 1,
      topic: 'Энгийн бутархай',
    },
    {
      type: 'multi',
      text: 'Дараахаас аль нь 0.5-тай тэнцүү вэ?',
      optionA: '1/2',
      optionB: '50%',
      optionC: '5/100',
      optionD: '2/4',
      optionE: '',
      optionF: '',
      correct: 'A;B;D',
      points: 2,
      topic: 'Аравтын бутархай',
    },
    {
      type: 'truefalse',
      text: '25% нь 1/4-тэй тэнцүү.',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      optionE: '',
      optionF: '',
      correct: 'A',
      points: 1,
      topic: 'Хувь',
    },
    {
      type: 'short',
      text: '80-ийн 25% хэд вэ?',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      optionE: '',
      optionF: '',
      correct: '20,20.0',
      points: 1,
      topic: 'Хувь',
    },
  ];

  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_COLUMNS] });
  sheet['!cols'] = [
    { wch: 11 },
    { wch: 52 },
    ...Array.from({ length: 6 }, () => ({ wch: 14 })),
    { wch: 10 },
    { wch: 7 },
    { wch: 20 },
  ];

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',' });
    // Excel-д кирилл зөв нээгдэхийн тулд BOM нэмнэ
    downloadBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), 'asuult-zagvar.csv');
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Асуултууд');
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'asuult-zagvar.xlsx',
  );
}
