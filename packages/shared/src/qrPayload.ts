/**
 * QR кодын payload — кодчилол, хэсэглэлт, нэгтгэлт, шифрлэлт.
 *
 * Кодчилол: `JSON → pako.deflateRaw → base64url`
 * base64url цагаан толгой (A–Z a–z 0–9 - _) нь URL-д аюулгүй бөгөөд
 * `&`, `=`, `?` агуулахгүй тул query параметрт шууд орж чадна.
 */

import { deflateRaw, inflateRaw } from 'pako';
import type { AnswerValue, ExamMode, Question, QuestionType } from './types';
import { TRUE_OPTION_ID, FALSE_OPTION_ID } from './scoring';

/** Нэг QR-д багтаах хамгийн их байт (error correction level M). */
export const QR_DEFAULT_MAX_BYTES = 1200;

/** offlineQr горимд асуулт хэт олон болохоос сэрэмжлүүлэх босго. */
export const QR_QUESTION_WARN_THRESHOLD = 25;

// ---------------------------------------------------------------------------
// 1. base64url
// ---------------------------------------------------------------------------

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const B64URL_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < B64URL_ALPHABET.length; i++) {
    table[B64URL_ALPHABET[i]!] = i;
  }
  return table;
})();

/** Байт массивыг base64url мөр болгоно (дүүргэлтийн `=` тэмдэггүй). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64URL_ALPHABET[(triple >> 18) & 63]!;
    out += B64URL_ALPHABET[(triple >> 12) & 63]!;
    out += B64URL_ALPHABET[(triple >> 6) & 63]!;
    out += B64URL_ALPHABET[triple & 63]!;
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i]! << 16;
    out += B64URL_ALPHABET[(chunk >> 18) & 63]!;
    out += B64URL_ALPHABET[(chunk >> 12) & 63]!;
  } else if (remaining === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64URL_ALPHABET[(chunk >> 18) & 63]!;
    out += B64URL_ALPHABET[(chunk >> 12) & 63]!;
    out += B64URL_ALPHABET[(chunk >> 6) & 63]!;
  }
  return out;
}

/** base64url мөрийг байт массив болгоно. Буруу тэмдэгт байвал алдаа шиднэ. */
export function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const fullGroups = Math.floor(clean.length / 4);
  const remainder = clean.length % 4;
  if (remainder === 1) {
    throw new Error('base64url: буруу урт');
  }
  const outLength = fullGroups * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
  const out = new Uint8Array(outLength);

  let outIndex = 0;
  let position = 0;
  for (let g = 0; g < fullGroups; g++) {
    const a = lookup(clean, position++);
    const b = lookup(clean, position++);
    const c = lookup(clean, position++);
    const d = lookup(clean, position++);
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    out[outIndex++] = (chunk >> 16) & 255;
    out[outIndex++] = (chunk >> 8) & 255;
    out[outIndex++] = chunk & 255;
  }
  if (remainder === 2) {
    const a = lookup(clean, position++);
    const b = lookup(clean, position++);
    out[outIndex++] = ((a << 18) | (b << 12)) >> 16;
  } else if (remainder === 3) {
    const a = lookup(clean, position++);
    const b = lookup(clean, position++);
    const c = lookup(clean, position++);
    const chunk = (a << 18) | (b << 12) | (c << 6);
    out[outIndex++] = (chunk >> 16) & 255;
    out[outIndex++] = (chunk >> 8) & 255;
  }
  return out;
}

function lookup(source: string, index: number): number {
  const char = source[index]!;
  const value = B64URL_LOOKUP[char];
  if (value === undefined) {
    throw new Error(`base64url: зөвшөөрөгдөөгүй тэмдэгт "${char}"`);
  }
  return value;
}

/** UTF-8 байтын урт. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ---------------------------------------------------------------------------
// 2. Payload кодчилол
// ---------------------------------------------------------------------------

/** Дурын утгыг `JSON → deflateRaw → base64url` болгоно. */
export function encodePayload(value: unknown): string {
  const json = JSON.stringify(value);
  const deflated = deflateRaw(new TextEncoder().encode(json), { level: 9 });
  return bytesToBase64Url(deflated);
}

/** `encodePayload`-ийн урвуу үйлдэл. */
export function decodePayload<T>(encoded: string): T {
  const bytes = base64UrlToBytes(encoded);
  const json = new TextDecoder().decode(inflateRaw(bytes));
  return JSON.parse(json) as T;
}

// ---------------------------------------------------------------------------
// 3. offlineQr — шалгалтын payload
// ---------------------------------------------------------------------------

/** QR дотор явах асуултын хураангуй хэлбэр (талбарын нэр богино). */
export interface OfflineQuestion {
  id: string;
  o: number;
  t: QuestionType;
  q: string;
  op?: { id: string; t: string }[];
  p: number;
  tp?: string;
}

/** QR дотор явах шалгалтын хураангуй хэлбэр. Багшийн имэйл ОРОХГҮЙ. */
export interface OfflineExam {
  id: string;
  title: string;
  subject: string;
  teacherName: string;
  mode: ExamMode;
  passThreshold: number;
  durationMin?: number;
  shuffle: boolean;
  showAnswers: boolean;
  onePerPage: boolean;
  questions: OfflineQuestion[];
}

/**
 * offlineQr горимын бүрэн payload.
 * `s` — AES-GCM-ээр шифрлэсэн зөв хариултууд, `k` — түүний түлхүүр (base64url).
 */
export interface OfflineExamPayload {
  v: 1;
  e: OfflineExam;
  s: string;
  k: string;
}

/** Шифрлэгдэх нууц хэсэг — асуултын id → зөв хариулт. */
export interface OfflineSecrets {
  [questionId: string]: { c?: string[]; a?: string[] };
}

/** `Question[]`-ээс QR-т орох хураангуй хэлбэр ба нууц хэсгийг салгана. */
export function splitQuestionsForQr(questions: readonly Question[]): {
  publicQuestions: OfflineQuestion[];
  secrets: OfflineSecrets;
} {
  const publicQuestions: OfflineQuestion[] = [];
  const secrets: OfflineSecrets = {};

  for (const question of questions) {
    const item: OfflineQuestion = {
      id: question.id,
      o: question.order,
      t: question.type,
      q: question.text,
      p: question.points,
    };
    if (question.options && question.options.length > 0) {
      item.op = question.options.map((option) => ({ id: option.id, t: option.text }));
    }
    if (question.topic !== undefined && question.topic !== '') {
      item.tp = question.topic;
    }
    publicQuestions.push(item);

    const secret: { c?: string[]; a?: string[] } = {};
    if (question.correctOptionIds && question.correctOptionIds.length > 0) {
      secret.c = question.correctOptionIds;
    }
    if (question.acceptedAnswers && question.acceptedAnswers.length > 0) {
      secret.a = question.acceptedAnswers;
    }
    secrets[question.id] = secret;
  }

  return { publicQuestions, secrets };
}

/** Хураангуй хэлбэр + тайлагдсан нууцаас бүрэн `Question[]` сэргээнэ. */
export function mergeQuestionsFromQr(
  examId: string,
  publicQuestions: readonly OfflineQuestion[],
  secrets: OfflineSecrets,
): Question[] {
  return publicQuestions.map((item) => {
    const secret = secrets[item.id] ?? {};
    const question: Question = {
      id: item.id,
      examId,
      order: item.o,
      type: item.t,
      text: item.q,
      points: item.p,
    };
    if (item.op) question.options = item.op.map((option) => ({ id: option.id, text: option.t }));
    if (item.tp !== undefined) question.topic = item.tp;
    if (secret.c) question.correctOptionIds = secret.c;
    if (secret.a) question.acceptedAnswers = secret.a;
    return question;
  });
}

// ---------------------------------------------------------------------------
// 4. AES-GCM шифрлэлт (зөв хариултыг нуух)
// ---------------------------------------------------------------------------
//
// ⚠ ХЯЗГААРЛАЛТ: түлхүүр нь payload-тай ХАМТ явдаг тул энэ нь криптографийн
// хамгаалалт БИШ. Зөвхөн QR-ыг задлаад шууд зөв хариулт харагдахаас
// сэргийлнэ. Өндөр эрсдэлтэй шалгалтад `online`/`lan` горим ашиглана.

// `shared` багц DOM lib-ээс хамаарахгүй байхын тулд Web Crypto-ийн хэрэгтэй
// хэсгийг л бүтцээр тодорхойлов (Node 20 болон браузер хоёуланд тохирно).
interface MinimalSubtleCrypto {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  encrypt(
    algorithm: { name: string; iv: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  decrypt(
    algorithm: { name: string; iv: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
}

interface MinimalCrypto {
  subtle?: MinimalSubtleCrypto;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

function getCrypto(): MinimalCrypto {
  const cryptoRef = (globalThis as { crypto?: MinimalCrypto }).crypto;
  if (!cryptoRef) {
    throw new Error('Web Crypto API байхгүй байна.');
  }
  return cryptoRef;
}

function getSubtleCrypto(): MinimalSubtleCrypto {
  const subtle = getCrypto().subtle;
  if (!subtle) {
    throw new Error(
      'crypto.subtle байхгүй байна (AES-GCM шифрлэлт хийх боломжгүй). ' +
        'Браузерт энэ нь https эсвэл localhost шаарддаг.',
    );
  }
  return subtle;
}

/** Криптографийн санамсаргүй байтууд. */
function randomBytes(length: number): Uint8Array {
  return getCrypto().getRandomValues(new Uint8Array(length));
}

/** 256-бит AES түлхүүр үүсгэж base64url болгож буцаана. */
export async function generateSecretKey(): Promise<string> {
  return bytesToBase64Url(randomBytes(32));
}

/** Нууц хэсгийг AES-GCM-ээр шифрлэнэ. Гаралт: `base64url(iv ‖ ciphertext)`. */
export async function encryptSecrets(
  secrets: OfflineSecrets,
  keyBase64Url: string,
): Promise<string> {
  const subtle = getSubtleCrypto();
  const keyBytes = base64UrlToBytes(keyBase64Url);
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);

  const iv = randomBytes(12);

  // Нууц хэсгийг мөн шахаж жижигрүүлнэ.
  const plain = deflateRaw(new TextEncoder().encode(JSON.stringify(secrets)), { level: 9 });
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));

  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return bytesToBase64Url(combined);
}

/** `encryptSecrets`-ийн урвуу үйлдэл. */
export async function decryptSecrets(
  encrypted: string,
  keyBase64Url: string,
): Promise<OfflineSecrets> {
  const subtle = getSubtleCrypto();
  const keyBytes = base64UrlToBytes(keyBase64Url);
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

  const combined = base64UrlToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher));
  const json = new TextDecoder().decode(inflateRaw(plain));
  return JSON.parse(json) as OfflineSecrets;
}

// ---------------------------------------------------------------------------
// 5. QR хэсэглэлт
// ---------------------------------------------------------------------------

/**
 * Хэсэглэсэн QR-ын дугтуй.
 *
 * ASSUMPTION: Даалгаварт `{v:1, id, i, n, c}` бүтэц заасан. Үүнийг JSON болгож
 * base64 хийвэл 4/3 дахин томордог тул ЯГ ижил талбаруудыг URL query болгож
 * дамжуулна: `?v=1&id=<id>&i=<i>&n=<n>&c=<хэсэг>`. Ингэснээр нэмэлт зардал
 * ~26 байт л болж, утасны үндсэн камерын апп ч линкийг нээж чадна.
 *
 * ASSUMPTION: Хэсэглэлт нь кодчилогдсон МӨРийг байтаар зүсдэг (асуулт тус
 * бүрээр биш). Тиймээс "нэг асуулт нэг хэсэгт багтахгүй" гэсэн асуудал
 * үүсэхгүй — зөвхөн нийт QR-ын тоо л нэмэгдэнэ.
 */
export interface QrChunk {
  v: 1;
  id: string;
  i: number;
  n: number;
  c: string;
}

export type ExamQrScan = { kind: 'full'; encoded: string } | { kind: 'chunk'; chunk: QrChunk };

function examUrlBase(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/#/x`;
}

/**
 * offlineQr горимын QR слайдуудыг үүсгэнэ.
 * Нэг QR-д багтвал `[url?d=...]`, эс бөгөөс хэсэглэсэн олон URL.
 */
export function buildExamQrSlides(
  encoded: string,
  options: { appUrl: string; chunkId: string; maxBytes?: number },
): string[] {
  const maxBytes = options.maxBytes ?? QR_DEFAULT_MAX_BYTES;
  const base = examUrlBase(options.appUrl);

  const single = `${base}?d=${encoded}`;
  if (byteLength(single) <= maxBytes) return [single];

  let chunkCount = 2;
  let capacity = 0;
  for (let guard = 0; guard < 12; guard++) {
    const overhead = byteLength(
      `${base}?v=1&id=${options.chunkId}&i=${chunkCount}&n=${chunkCount}&c=`,
    );
    capacity = maxBytes - overhead;
    if (capacity <= 0) {
      throw new Error(
        `QR-ын багтаамж хүрэлцэхгүй байна: нэмэлт зардал ${overhead} байт > дээд хэмжээ ${maxBytes} байт.`,
      );
    }
    const needed = Math.ceil(encoded.length / capacity);
    if (needed <= chunkCount) {
      chunkCount = needed;
      break;
    }
    chunkCount = needed;
  }

  const slides: string[] = [];
  for (let index = 0; index < chunkCount; index++) {
    const part = encoded.slice(index * capacity, (index + 1) * capacity);
    slides.push(`${base}?v=1&id=${options.chunkId}&i=${index + 1}&n=${chunkCount}&c=${part}`);
  }
  return slides;
}

/** QR-аас уншсан текстийг задална (бүтэн payload эсвэл хэсэг). */
export function parseExamQr(text: string): ExamQrScan | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const queryStart = trimmed.lastIndexOf('?');
  if (queryStart === -1) {
    // Түүхий payload — шууд base64url мөр
    if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return { kind: 'full', encoded: trimmed };
    return null;
  }

  const params = new URLSearchParams(trimmed.slice(queryStart + 1));

  const full = params.get('d');
  if (full !== null && full !== '') return { kind: 'full', encoded: full };

  const id = params.get('id');
  const i = Number(params.get('i'));
  const n = Number(params.get('n'));
  const c = params.get('c');
  if (id && c && Number.isInteger(i) && Number.isInteger(n) && i >= 1 && n >= 1 && i <= n) {
    return { kind: 'chunk', chunk: { v: 1, id, i, n, c } };
  }
  return null;
}

/** Дутуу байгаа хэсгийн дугаарууд (1-ээс эхэлсэн). */
export function missingChunkIndices(chunks: readonly QrChunk[]): number[] {
  if (chunks.length === 0) return [];
  const total = chunks[0]!.n;
  const present = new Set(chunks.map((chunk) => chunk.i));
  const missing: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

/** Бүх хэсэг цугласан бол нэгтгэж кодчилогдсон мөрийг буцаана. */
export function reassembleChunks(chunks: readonly QrChunk[]): string {
  if (chunks.length === 0) throw new Error('Нэгтгэх хэсэг алга.');
  const first = chunks[0]!;
  const id = first.id;
  const total = first.n;

  const byIndex = new Map<number, string>();
  for (const chunk of chunks) {
    if (chunk.id !== id) throw new Error('Өөр өөр QR багцын хэсгүүд холилдсон байна.');
    if (chunk.n !== total) throw new Error('Хэсгүүдийн нийт тоо зөрж байна.');
    byIndex.set(chunk.i, chunk.c);
  }

  const missing = missingChunkIndices(chunks);
  if (missing.length > 0) {
    throw new Error(`Дутуу хэсэг: ${missing.join(', ')} / ${total}`);
  }

  let out = '';
  for (let i = 1; i <= total; i++) {
    out += byIndex.get(i)!;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Хариулт-QR (сурагч → багш)
// ---------------------------------------------------------------------------

export const ANSWER_QR_PREFIX = 'SQA1:';
export const ANSWER_QR_CHUNK_PREFIX = 'SQC1:';

export interface AnswerQrPayload {
  v: 1;
  e: string;
  m: ExamMode;
  k: string;
  ln: string;
  fn: string;
  cl: string;
  a: [number, AnswerValue][];
  t: string;
}

/** Хариулт-QR-ын агуулгыг үүсгэнэ (шаардвал хэсэглэнэ). */
export function buildAnswerQrSlides(
  payload: AnswerQrPayload,
  options: { chunkId: string; maxBytes?: number } = { chunkId: 'a' },
): string[] {
  const maxBytes = options.maxBytes ?? QR_DEFAULT_MAX_BYTES;
  const encoded = encodePayload(payload);

  const single = `${ANSWER_QR_PREFIX}${encoded}`;
  if (byteLength(single) <= maxBytes) return [single];

  let chunkCount = 2;
  let capacity = 0;
  for (let guard = 0; guard < 12; guard++) {
    const overhead = byteLength(
      `${ANSWER_QR_CHUNK_PREFIX}${options.chunkId}:${chunkCount}:${chunkCount}:`,
    );
    capacity = maxBytes - overhead;
    if (capacity <= 0) throw new Error('Хариулт-QR-ын багтаамж хүрэлцэхгүй байна.');
    const needed = Math.ceil(encoded.length / capacity);
    if (needed <= chunkCount) {
      chunkCount = needed;
      break;
    }
    chunkCount = needed;
  }

  const slides: string[] = [];
  for (let index = 0; index < chunkCount; index++) {
    const part = encoded.slice(index * capacity, (index + 1) * capacity);
    slides.push(`${ANSWER_QR_CHUNK_PREFIX}${options.chunkId}:${index + 1}:${chunkCount}:${part}`);
  }
  return slides;
}

export type AnswerQrScan =
  { kind: 'full'; payload: AnswerQrPayload } | { kind: 'chunk'; chunk: QrChunk };

/** Багшийн уншигч — хариулт-QR-ын текстийг задална. */
export function parseAnswerQr(text: string): AnswerQrScan | null {
  const trimmed = text.trim();

  if (trimmed.startsWith(ANSWER_QR_PREFIX)) {
    const encoded = trimmed.slice(ANSWER_QR_PREFIX.length);
    return { kind: 'full', payload: decodePayload<AnswerQrPayload>(encoded) };
  }

  if (trimmed.startsWith(ANSWER_QR_CHUNK_PREFIX)) {
    const rest = trimmed.slice(ANSWER_QR_CHUNK_PREFIX.length);
    const parts = rest.split(':');
    if (parts.length < 4) return null;
    const [id, rawIndex, rawTotal, ...dataParts] = parts;
    const i = Number(rawIndex);
    const n = Number(rawTotal);
    if (!id || !Number.isInteger(i) || !Number.isInteger(n) || i < 1 || n < 1 || i > n) return null;
    return { kind: 'chunk', chunk: { v: 1, id, i, n, c: dataParts.join(':') } };
  }

  return null;
}

/** Хэсгүүдээс хариулт-QR-ын payload сэргээнэ. */
export function decodeAnswerQrChunks(chunks: readonly QrChunk[]): AnswerQrPayload {
  return decodePayload<AnswerQrPayload>(reassembleChunks(chunks));
}

// ---------------------------------------------------------------------------
// 7. 6 оронтой нөөц код
// ---------------------------------------------------------------------------
//
// ASSUMPTION: Код нь ЗӨВХӨН хариултыг агуулна — сурагчийн нэр/ангийг багш
// гараар оруулна (сурагч нүдэн дээр нь байгаа тул). 10 асуулт × 7 боломж
// (0 = хариулаагүй, 1–6 = сонголт) = 7¹⁰ ≈ 2.82×10⁸ < 36⁶ ≈ 2.18×10⁹.

/** Нөөц кодыг ашиглах боломжтой эсэх. */
export function canUseManualCode(questions: readonly Question[]): boolean {
  if (questions.length === 0 || questions.length > 10) return false;
  return questions.every((question) => {
    if (question.type === 'truefalse') return true;
    if (question.type !== 'single') return false;
    return (question.options?.length ?? 0) <= 6;
  });
}

const MANUAL_CODE_RADIX = 7;
const MANUAL_CODE_LENGTH = 6;

/** Хариултуудыг 6 оронтой base-36 код болгоно. Боломжгүй бол `null`. */
export function encodeManualCode(
  questions: readonly Question[],
  answers: ReadonlyMap<string, AnswerValue>,
): string | null {
  if (!canUseManualCode(questions)) return null;
  const ordered = questions.slice().sort((a, b) => a.order - b.order);

  let value = 0;
  for (let index = ordered.length - 1; index >= 0; index--) {
    const question = ordered[index]!;
    const answer = answers.get(question.id) ?? null;
    value = value * MANUAL_CODE_RADIX + manualDigitFor(question, answer);
  }
  return value.toString(36).toUpperCase().padStart(MANUAL_CODE_LENGTH, '0');
}

function manualDigitFor(question: Question, answer: AnswerValue): number {
  let optionId: string | null = null;
  if (question.type === 'truefalse') {
    if (typeof answer === 'boolean') optionId = answer ? TRUE_OPTION_ID : FALSE_OPTION_ID;
    else if (typeof answer === 'string') optionId = answer;
  } else if (typeof answer === 'string') {
    optionId = answer;
  }
  if (optionId === null) return 0;

  const options =
    question.type === 'truefalse'
      ? [{ id: TRUE_OPTION_ID }, { id: FALSE_OPTION_ID }]
      : (question.options ?? []);
  const position = options.findIndex((option) => option.id === optionId);
  return position === -1 ? 0 : position + 1;
}

/** Нөөц кодоос хариултуудыг сэргээнэ. Буруу код бол `null`. */
export function decodeManualCode(
  questions: readonly Question[],
  code: string,
): { questionId: string; value: AnswerValue }[] | null {
  if (!canUseManualCode(questions)) return null;
  const clean = code.trim().toUpperCase();
  if (!/^[0-9A-Z]{1,6}$/.test(clean)) return null;

  let value = Number.parseInt(clean, 36);
  if (!Number.isFinite(value) || value < 0) return null;

  const ordered = questions.slice().sort((a, b) => a.order - b.order);
  const result: { questionId: string; value: AnswerValue }[] = [];

  for (const question of ordered) {
    const digit = value % MANUAL_CODE_RADIX;
    value = Math.floor(value / MANUAL_CODE_RADIX);

    if (digit === 0) {
      result.push({ questionId: question.id, value: null });
      continue;
    }
    const options =
      question.type === 'truefalse'
        ? [{ id: TRUE_OPTION_ID }, { id: FALSE_OPTION_ID }]
        : (question.options ?? []);
    const option = options[digit - 1];
    if (!option) {
      result.push({ questionId: question.id, value: null });
      continue;
    }
    if (question.type === 'truefalse') {
      result.push({ questionId: question.id, value: option.id === TRUE_OPTION_ID });
    } else {
      result.push({ questionId: question.id, value: option.id });
    }
  }

  return value === 0 ? result : null;
}
