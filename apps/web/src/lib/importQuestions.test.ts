import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { IMPORT_COLUMNS, importQuestionsFromFile } from './importQuestions';
import { parseAcceptedAnswers } from './examDraft';

/** Мөрүүдээс .xlsx File объект үүсгэнэ. */
function makeFile(rows: Record<string, string | number>[]): File {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_COLUMNS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Асуултууд');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([bytes], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const EMPTY = {
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  optionE: '',
  optionF: '',
};

describe('importQuestionsFromFile', () => {
  it('нийтлэг Монгол болон зайтай толгойг танина', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Төрөл', 'Асуулт', 'A', 'B', 'Зөв хариулт', 'Оноо', 'Сэдэв'],
      ['single', 'Хоёрын нэг', 'Тийм', 'Үгүй', 'A', 1, 'Ерөнхий'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Асуултууд');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([bytes], 'mongolian-headers.xlsx');

    const result = await importQuestionsFromFile(file);

    expect(result.errors).toEqual([]);
    expect(result.questions[0]?.text).toBe('Хоёрын нэг');
    expect(result.questions[0]?.correctOptionIds).toEqual(['A']);
  });

  it('дөрвөн төрлийг зөв уншина', async () => {
    const file = makeFile([
      {
        type: 'single',
        text: 'Нэг зөв',
        ...EMPTY,
        optionA: '0.75',
        optionB: '0.34',
        correct: 'A',
        points: 1,
        topic: 'Бутархай',
      },
      {
        type: 'multi',
        text: 'Олон зөв',
        ...EMPTY,
        optionA: '1/2',
        optionB: '50%',
        optionC: '5/100',
        correct: 'A;B',
        points: 2,
        topic: 'Аравтын',
      },
      { type: 'truefalse', text: 'Үнэн үү?', ...EMPTY, correct: 'A', points: 1, topic: 'Хувь' },
      {
        type: 'short',
        text: '80-ийн 25%?',
        ...EMPTY,
        correct: '20,20.0',
        points: 1,
        topic: 'Хувь',
      },
    ]);

    const result = await importQuestionsFromFile(file);

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(4);

    const [single, multi, truefalse, short] = result.questions;

    expect(single!.type).toBe('single');
    expect(single!.correctOptionIds).toEqual(['A']);
    expect(single!.options).toHaveLength(2);
    expect(single!.points).toBe(1);
    expect(single!.topic).toBe('Бутархай');

    expect(multi!.type).toBe('multi');
    expect(multi!.correctOptionIds).toEqual(['A', 'B']);
    expect(multi!.points).toBe(2);

    expect(truefalse!.type).toBe('truefalse');
    expect(truefalse!.correctOptionIds).toEqual(['A']);
    expect(truefalse!.options.map((option) => option.id)).toEqual(['A', 'B']);

    expect(short!.type).toBe('short');
    expect(parseAcceptedAnswers(short!.acceptedAnswers)).toEqual(['20', '20.0']);
  });

  it('Үнэн/Худал гэсэн монгол утгыг таньна', async () => {
    const file = makeFile([
      { type: 'truefalse', text: 'A', ...EMPTY, correct: 'Худал', points: 1, topic: '' },
    ]);
    const result = await importQuestionsFromFile(file);
    expect(result.errors).toEqual([]);
    expect(result.questions[0]!.correctOptionIds).toEqual(['B']);
  });

  it('алдаатай мөрийг мөрийн дугаартай мэдээлж, зөв мөрийг импортлоно', async () => {
    const file = makeFile([
      // 2-р мөр: зөв
      {
        type: 'single',
        text: 'Зөв мөр',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'A',
        points: 1,
        topic: '',
      },
      // 3-р мөр: танигдахгүй төрөл
      { type: 'магадгүй', text: 'X', ...EMPTY, correct: 'A', points: 1, topic: '' },
      // 4-р мөр: байхгүй сонголтыг зөв гэсэн
      {
        type: 'single',
        text: 'Y',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'D',
        points: 1,
        topic: '',
      },
      // 5-р мөр: сонголт дутуу
      { type: 'single', text: 'Z', ...EMPTY, optionA: 'A', correct: 'A', points: 1, topic: '' },
      // 6-р мөр: оноо буруу
      {
        type: 'single',
        text: 'W',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'A',
        points: 1.3,
        topic: '',
      },
    ]);

    const result = await importQuestionsFromFile(file);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.text).toBe('Зөв мөр');
    expect(result.errors.map((error) => error.row)).toEqual([3, 4, 5, 6]);
    expect(result.errors[0]!.message).toContain('танигдахгүй');
    expect(result.errors[3]!.message).toContain('0.5');
  });

  it('single төрөлд олон зөв хариулт өгвөл татгалзана', async () => {
    const file = makeFile([
      {
        type: 'single',
        text: 'X',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'A;B',
        points: 1,
        topic: '',
      },
    ]);
    const result = await importQuestionsFromFile(file);
    expect(result.questions).toHaveLength(0);
    expect(result.errors[0]!.message).toContain('single');
  });

  it('бүрэн хоосон мөрийг чимээгүй алгасна', async () => {
    const file = makeFile([
      { type: '', text: '', ...EMPTY, correct: '', points: '', topic: '' },
      {
        type: 'single',
        text: 'Ганц',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'A',
        points: 1,
        topic: '',
      },
    ]);
    const result = await importQuestionsFromFile(file);
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('оноо заагаагүй бол 1 болно', async () => {
    const file = makeFile([
      {
        type: 'single',
        text: 'X',
        ...EMPTY,
        optionA: 'A',
        optionB: 'B',
        correct: 'A',
        points: '',
        topic: '',
      },
    ]);
    const result = await importQuestionsFromFile(file);
    expect(result.questions[0]!.points).toBe(1);
  });
});
