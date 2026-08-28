import { describe, expect, it } from 'vitest';
import type { AnswerValue, Question } from './types';
import {
  ANSWER_QR_PREFIX,
  QR_DEFAULT_MAX_BYTES,
  base64UrlToBytes,
  buildAnswerQrSlides,
  buildExamQrSlides,
  byteLength,
  bytesToBase64Url,
  canUseManualCode,
  decodeAnswerQrChunks,
  decodeManualCode,
  decodePayload,
  decryptSecrets,
  encodeManualCode,
  encodePayload,
  encryptSecrets,
  generateSecretKey,
  mergeQuestionsFromQr,
  missingChunkIndices,
  parseAnswerQr,
  parseExamQr,
  reassembleChunks,
  splitQuestionsForQr,
  type AnswerQrPayload,
  type OfflineExamPayload,
  type QrChunk,
} from './qrPayload';
import { SEED_EXAM, SEED_QUESTIONS } from './seed-data';
import { TRUE_OPTION_ID, FALSE_OPTION_ID } from './scoring';

const APP_URL = 'https://shalgalt.example.mn';

describe('base64url', () => {
  it('roundtrip — бүх үлдэгдлийн хувилбар (0, 1, 2 байт)', () => {
    for (let length = 0; length <= 32; length++) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) % 256;
      const encoded = bytesToBase64Url(bytes);
      expect(base64UrlToBytes(encoded)).toEqual(bytes);
    }
  });

  it('зөвхөн URL-д аюулгүй тэмдэгт ашиглана', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(bytesToBase64Url(bytes)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('дүүргэлтийн = тэмдэг оруулахгүй', () => {
    expect(bytesToBase64Url(new Uint8Array([1]))).not.toContain('=');
    expect(bytesToBase64Url(new Uint8Array([1, 2]))).not.toContain('=');
  });

  it('буруу тэмдэгт байвал алдаа шиднэ', () => {
    expect(() => base64UrlToBytes('ab*d')).toThrow();
  });

  it('буруу урт байвал алдаа шиднэ', () => {
    expect(() => base64UrlToBytes('abcde')).toThrow();
  });
});

describe('encodePayload / decodePayload', () => {
  it('roundtrip — энгийн объект', () => {
    const value = { a: 1, b: 'хоёр', c: [true, false, null] };
    expect(decodePayload(encodePayload(value))).toEqual(value);
  });

  it('roundtrip — кирилл текст', () => {
    const value = { t: 'Бутархай ба хувь — сэдвийн үнэлгээ', ё: 'Ёндон' };
    expect(decodePayload(encodePayload(value))).toEqual(value);
  });

  it('шахалт үр дүнтэй — давтагдсан текст богиносно', () => {
    const repetitive = { list: Array.from({ length: 60 }, () => 'Аравтын бутархай') };
    const raw = JSON.stringify(repetitive).length;
    expect(encodePayload(repetitive).length).toBeLessThan(raw / 3);
  });

  it('гаралт нь base64url цагаан толгойтой', () => {
    expect(encodePayload({ x: 1 })).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('splitQuestionsForQr / mergeQuestionsFromQr', () => {
  it('зөв хариулт нийтийн хэсэгт ОРОХГҮЙ', () => {
    const { publicQuestions } = splitQuestionsForQr(SEED_QUESTIONS);
    const serialized = JSON.stringify(publicQuestions);
    expect(serialized).not.toContain('correctOptionIds');
    expect(serialized).not.toContain('acceptedAnswers');
  });

  it('нийтийн + нууц хэсгээс анхны асуултууд бүрэн сэргэнэ', () => {
    const { publicQuestions, secrets } = splitQuestionsForQr(SEED_QUESTIONS);
    const restored = mergeQuestionsFromQr(SEED_EXAM.id, publicQuestions, secrets);
    expect(restored).toEqual(SEED_QUESTIONS);
  });
});

describe('AES-GCM шифрлэлт', () => {
  it('roundtrip', async () => {
    const { secrets } = splitQuestionsForQr(SEED_QUESTIONS);
    const key = await generateSecretKey();
    const encrypted = await encryptSecrets(secrets, key);
    expect(await decryptSecrets(encrypted, key)).toEqual(secrets);
  });

  it('шифрлэсэн текстэд зөв хариулт ил харагдахгүй', async () => {
    const { secrets } = splitQuestionsForQr(SEED_QUESTIONS);
    const key = await generateSecretKey();
    const encrypted = await encryptSecrets(secrets, key);
    expect(encrypted).not.toContain('0.75');
    expect(encrypted).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('өөр түлхүүрээр тайлж чадахгүй', async () => {
    const { secrets } = splitQuestionsForQr(SEED_QUESTIONS);
    const encrypted = await encryptSecrets(secrets, await generateSecretKey());
    await expect(decryptSecrets(encrypted, await generateSecretKey())).rejects.toThrow();
  });

  it('түлхүүр бүр өөр (санамсаргүй)', async () => {
    const keys = await Promise.all([generateSecretKey(), generateSecretKey()]);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('шалгалтын QR — нэг слайд', () => {
  it('жижиг payload нэг QR-д багтана', () => {
    const encoded = encodePayload({ v: 1, e: { id: 'x' } });
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12' });
    expect(slides).toHaveLength(1);
    expect(slides[0]).toBe(`${APP_URL}/#/x?d=${encoded}`);
  });

  it('уншиж задлахад анхны payload гарна', () => {
    const payload = { v: 1 as const, hello: 'сайн уу' };
    const encoded = encodePayload(payload);
    const [slide] = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12' });
    const scan = parseExamQr(slide!);
    expect(scan).not.toBeNull();
    expect(scan!.kind).toBe('full');
    expect(decodePayload(scan!.kind === 'full' ? scan!.encoded : '')).toEqual(payload);
  });
});

describe('шалгалтын QR — хэсэглэлт', () => {
  // Бодит шалгалтын хэмжээнд ойрхон — асуулт, сонголт бүр өөр өөр агуулгатай
  // (давтагдсан текст бол deflate хэт сайн шахаад хэсэглэлт шалгагдахгүй).
  const NOUNS = [
    'бутархай',
    'хуваарь',
    'хүртвэр',
    'аравтын орон',
    'хувь',
    'харьцаа',
    'коэффициент',
    'үржвэр',
    'ялгавар',
    'нийлбэр',
    'хуваагдагч',
    'үлдэгдэл',
  ];
  const VERBS = ['олно уу', 'тооцоолно уу', 'хураангуйлна уу', 'харьцуулна уу'];

  function buildBigPayload(questionCount: number): string {
    const questions: Question[] = Array.from({ length: questionCount }, (_, index) => ({
      id: `q${index + 1}`,
      examId: 'big',
      order: index + 1,
      type: 'single',
      text:
        `${index + 1}. ${17 + index * 3}/${4 + index} илэрхийллийн ` +
        `${NOUNS[index % NOUNS.length]}-ыг ${VERBS[index % VERBS.length]}. ` +
        `Хариултаа ${2 + (index % 4)} орны нарийвчлалтай бичнэ үү.`,
      options: [
        { id: 'A', text: `${(index * 7 + 13) / 100} буюу ${index * 7 + 13} хувь` },
        { id: 'B', text: `${(index * 11 + 29) / 100} — ойролцоо утга` },
        { id: 'C', text: `${(index * 5 + 41) / 100} гэсэн буруу хувилбар` },
        { id: 'D', text: `${(index * 13 + 7) / 100} нь ${NOUNS[(index + 5) % NOUNS.length]}` },
      ],
      correctOptionIds: ['A'],
      points: 1,
      topic: NOUNS[index % 3],
    }));
    const { publicQuestions } = splitQuestionsForQr(questions);
    const payload = {
      v: 1,
      e: {
        id: 'bigexam00001',
        title: 'Том шалгалт',
        subject: 'Математик',
        teacherName: 'Багш',
        mode: 'pre',
        passThreshold: 60,
        shuffle: false,
        showAnswers: true,
        onePerPage: false,
        questions: publicQuestions,
      },
      s: 'x'.repeat(200),
      k: 'y'.repeat(43),
    };
    return encodePayload(payload);
  }

  it('том payload олон слайд болно, тус бүр нь хязгаартаа багтана', () => {
    const encoded = buildBigPayload(12);
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12', maxBytes: 400 });
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) {
      expect(byteLength(slide)).toBeLessThanOrEqual(400);
    }
  });

  it('хэсгүүдийг нэгтгэхэд анхны payload яг сэргэнэ', () => {
    const encoded = buildBigPayload(12);
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12', maxBytes: 400 });

    const chunks: QrChunk[] = slides.map((slide) => {
      const scan = parseExamQr(slide);
      expect(scan?.kind).toBe('chunk');
      return (scan as { kind: 'chunk'; chunk: QrChunk }).chunk;
    });

    expect(chunks.map((chunk) => chunk.i)).toEqual(
      Array.from({ length: chunks.length }, (_, i) => i + 1),
    );
    expect(chunks.every((chunk) => chunk.n === chunks.length)).toBe(true);
    expect(reassembleChunks(chunks)).toBe(encoded);
  });

  it('дараалал холилдсон ч зөв нэгтгэнэ', () => {
    const encoded = buildBigPayload(12);
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12', maxBytes: 400 });
    const chunks = slides
      .map((slide) => (parseExamQr(slide) as { chunk: QrChunk }).chunk)
      .reverse();
    expect(reassembleChunks(chunks)).toBe(encoded);
  });

  it('дутуу хэсгийг мэдээлнэ', () => {
    const encoded = buildBigPayload(12);
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'ab12', maxBytes: 400 });
    const chunks = slides.map((slide) => (parseExamQr(slide) as { chunk: QrChunk }).chunk);
    const partial = chunks.slice(0, chunks.length - 1);

    expect(missingChunkIndices(partial)).toEqual([chunks.length]);
    expect(() => reassembleChunks(partial)).toThrow(/Дутуу хэсэг/);
  });

  it('өөр багцын хэсэг холилдвол алдаа', () => {
    const a: QrChunk = { v: 1, id: 'aaa', i: 1, n: 2, c: 'AA' };
    const b: QrChunk = { v: 1, id: 'bbb', i: 2, n: 2, c: 'BB' };
    expect(() => reassembleChunks([a, b])).toThrow(/холилдсон/);
  });

  it('12 асуулттай бодит хэмжээний шалгалт 1200 байтад 2 QR болно', () => {
    const encoded = buildBigPayload(12);
    const slides = buildExamQrSlides(encoded, {
      appUrl: APP_URL,
      chunkId: 'ab12',
      maxBytes: QR_DEFAULT_MAX_BYTES,
    });
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(reassembleChunks(slides.map((s) => (parseExamQr(s) as { chunk: QrChunk }).chunk))).toBe(
      encoded,
    );
  });
});

describe('parseExamQr', () => {
  it('танигдахгүй текстэд null', () => {
    expect(parseExamQr('')).toBeNull();
    expect(parseExamQr('сайн уу')).toBeNull();
    expect(parseExamQr('https://example.com/?foo=bar')).toBeNull();
  });

  it('түүхий base64url мөрийг хүлээж авна', () => {
    const encoded = encodePayload({ hello: 'дэлхий', pad: 'x'.repeat(40) });
    const scan = parseExamQr(encoded);
    expect(scan).toEqual({ kind: 'full', encoded });
  });
});

describe('бүрэн урсгал — offlineQr', () => {
  it('шалгалт → QR → задлалт → зөв хариулт тайлагдана', async () => {
    const { publicQuestions, secrets } = splitQuestionsForQr(SEED_QUESTIONS);
    const key = await generateSecretKey();
    const encryptedSecrets = await encryptSecrets(secrets, key);

    const payload: OfflineExamPayload = {
      v: 1,
      e: {
        id: SEED_EXAM.id,
        title: SEED_EXAM.title,
        subject: SEED_EXAM.subject,
        teacherName: SEED_EXAM.teacherName,
        mode: 'pre',
        passThreshold: SEED_EXAM.passThreshold,
        shuffle: SEED_EXAM.shuffle,
        showAnswers: SEED_EXAM.showAnswersToStudent,
        onePerPage: SEED_EXAM.onePerPage,
        questions: publicQuestions,
      },
      s: encryptedSecrets,
      k: key,
    };

    // Багшийн имэйл payload-д ОРОХГҮЙ
    expect(JSON.stringify(payload)).not.toContain(SEED_EXAM.teacherEmail);

    const encoded = encodePayload(payload);
    const slides = buildExamQrSlides(encoded, { appUrl: APP_URL, chunkId: 'seed' });

    const rebuilt =
      slides.length === 1
        ? (parseExamQr(slides[0]!) as { encoded: string }).encoded
        : reassembleChunks(slides.map((s) => (parseExamQr(s) as { chunk: QrChunk }).chunk));

    const decoded = decodePayload<OfflineExamPayload>(rebuilt);
    expect(decoded.e.title).toBe(SEED_EXAM.title);
    expect(decoded.e.mode).toBe('pre');

    const restoredSecrets = await decryptSecrets(decoded.s, decoded.k);
    const questions = mergeQuestionsFromQr(decoded.e.id, decoded.e.questions, restoredSecrets);
    expect(questions).toEqual(SEED_QUESTIONS);
  });
});

describe('хариулт-QR', () => {
  const payload: AnswerQrPayload = {
    v: 1,
    e: SEED_EXAM.id,
    m: 'post',
    k: 'a'.repeat(64),
    ln: 'Дорж',
    fn: 'Ану',
    cl: '8а',
    a: [
      [1, 'A'],
      [2, 'B'],
      [3, true],
      [4, '3/4'],
      [5, 'B'],
      [6, ['A', 'B', 'D']],
      [7, 'A'],
      [8, true],
      [9, ['A', 'C']],
      [10, '20'],
    ],
    t: '2026-03-16T01:07:00.000Z',
  };

  it('нэг QR-д багтана', () => {
    const slides = buildAnswerQrSlides(payload, { chunkId: 'a1' });
    expect(slides).toHaveLength(1);
    expect(slides[0]!.startsWith(ANSWER_QR_PREFIX)).toBe(true);
    expect(byteLength(slides[0]!)).toBeLessThanOrEqual(QR_DEFAULT_MAX_BYTES);
  });

  it('roundtrip', () => {
    const [slide] = buildAnswerQrSlides(payload, { chunkId: 'a1' });
    const scan = parseAnswerQr(slide!);
    expect(scan?.kind).toBe('full');
    expect((scan as { kind: 'full'; payload: AnswerQrPayload }).payload).toEqual(payload);
  });

  it('хязгаар бага үед хэсэглэж, дараа нь нэгтгэнэ', () => {
    const slides = buildAnswerQrSlides(payload, { chunkId: 'a1', maxBytes: 120 });
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) expect(byteLength(slide)).toBeLessThanOrEqual(120);

    const chunks = slides.map((slide) => {
      const scan = parseAnswerQr(slide);
      expect(scan?.kind).toBe('chunk');
      return (scan as { kind: 'chunk'; chunk: QrChunk }).chunk;
    });
    expect(decodeAnswerQrChunks(chunks)).toEqual(payload);
  });

  it('танигдахгүй текстэд null', () => {
    expect(parseAnswerQr('https://example.com')).toBeNull();
    expect(parseAnswerQr('SQC1:abc')).toBeNull();
  });
});

describe('6 оронтой нөөц код', () => {
  function singleQuestion(order: number, optionCount: number): Question {
    return {
      id: `q${order}`,
      examId: 'm',
      order,
      type: 'single',
      text: `Асуулт ${order}`,
      options: Array.from({ length: optionCount }, (_, i) => ({
        id: String.fromCharCode(65 + i),
        text: `Сонголт ${i + 1}`,
      })),
      correctOptionIds: ['A'],
      points: 1,
    };
  }

  function trueFalseQuestion(order: number): Question {
    return {
      id: `q${order}`,
      examId: 'm',
      order,
      type: 'truefalse',
      text: `Асуулт ${order}`,
      options: [
        { id: TRUE_OPTION_ID, text: 'Үнэн' },
        { id: FALSE_OPTION_ID, text: 'Худал' },
      ],
      correctOptionIds: [TRUE_OPTION_ID],
      points: 1,
    };
  }

  it('нөхцөл хангасан шалгалтад боломжтой', () => {
    expect(canUseManualCode([singleQuestion(1, 4), trueFalseQuestion(2)])).toBe(true);
  });

  it('multi/short орсон бол боломжгүй', () => {
    const multi: Question = {
      id: 'qm',
      examId: 'm',
      order: 1,
      type: 'multi',
      text: 'M',
      options: [{ id: 'A', text: 'A' }],
      correctOptionIds: ['A'],
      points: 1,
    };
    expect(canUseManualCode([multi])).toBe(false);
    expect(encodeManualCode([multi], new Map())).toBeNull();
  });

  it('10-аас олон асуулттай бол боломжгүй', () => {
    const many = Array.from({ length: 11 }, (_, i) => singleQuestion(i + 1, 4));
    expect(canUseManualCode(many)).toBe(false);
  });

  it('6-аас олон сонголттой бол боломжгүй', () => {
    expect(canUseManualCode([singleQuestion(1, 7)])).toBe(false);
  });

  it('roundtrip — 10 асуулт', () => {
    const questions = [
      singleQuestion(1, 4),
      singleQuestion(2, 6),
      trueFalseQuestion(3),
      singleQuestion(4, 3),
      singleQuestion(5, 4),
      trueFalseQuestion(6),
      singleQuestion(7, 5),
      singleQuestion(8, 2),
      trueFalseQuestion(9),
      singleQuestion(10, 6),
    ];
    const answers = new Map<string, AnswerValue>([
      ['q1', 'B'],
      ['q2', 'F'],
      ['q3', true],
      ['q4', 'C'],
      ['q5', null],
      ['q6', false],
      ['q7', 'E'],
      ['q8', 'A'],
      ['q9', true],
      ['q10', 'D'],
    ]);

    const code = encodeManualCode(questions, answers);
    expect(code).not.toBeNull();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[0-9A-Z]{6}$/);

    const decoded = decodeManualCode(questions, code!);
    expect(decoded).toEqual([
      { questionId: 'q1', value: 'B' },
      { questionId: 'q2', value: 'F' },
      { questionId: 'q3', value: true },
      { questionId: 'q4', value: 'C' },
      { questionId: 'q5', value: null },
      { questionId: 'q6', value: false },
      { questionId: 'q7', value: 'E' },
      { questionId: 'q8', value: 'A' },
      { questionId: 'q9', value: true },
      { questionId: 'q10', value: 'D' },
    ]);
  });

  it('бүх боломжит хамгийн их утга 6 тэмдэгтэд багтана', () => {
    const questions = Array.from({ length: 10 }, (_, i) => singleQuestion(i + 1, 6));
    const answers = new Map<string, AnswerValue>(questions.map((q) => [q.id, 'F']));
    const code = encodeManualCode(questions, answers)!;
    expect(code).toHaveLength(6);
    expect(decodeManualCode(questions, code)).toHaveLength(10);
  });

  it('огт хариулаагүй бол 000000', () => {
    const questions = [singleQuestion(1, 4), trueFalseQuestion(2)];
    expect(encodeManualCode(questions, new Map())).toBe('000000');
  });

  it('буруу код бол null', () => {
    const questions = [singleQuestion(1, 4)];
    expect(decodeManualCode(questions, 'ZZZZZZ')).toBeNull(); // хэт том утга
    expect(decodeManualCode(questions, 'ab*')).toBeNull();
  });
});
