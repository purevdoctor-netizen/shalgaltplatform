/**
 * Текст нормчлол ба `studentKey` тооцоолол.
 *
 * Энэ модуль браузер, Node аль алинд ажиллана — зөвхөн стандарт JS API
 * (`TextEncoder`, `String.prototype.normalize`) ашиглана.
 */

// ---------------------------------------------------------------------------
// 1. Текст нормчлол
// ---------------------------------------------------------------------------

/**
 * ASSUMPTION: Даалгаварт "эхлэл/төгсгөлийн цэг, таслалыг хасах" гэсэн.
 * Утга бүхий тэмдэгтийг (%, -, /, +) санамсаргүй хасахгүйн тулд зөвхөн
 * өгүүлбэрийн цэг таслалын шинжтэй тэмдэгтүүдийг хязгаарлаж жагсаав.
 */
const EDGE_PUNCTUATION = /^[\s.,;:!?"'`«»„“”…]+|[\s.,;:!?"'`«»„“”…]+$/g;

const MULTI_SPACE = /\s+/g;

/**
 * `short` төрлийн хариулт харьцуулахад ашиглах нормчлол.
 *
 * Дараалал: Unicode NFC → trim → жижиг үсэг → давтах зайг нэг зай болгох
 * → эхлэл/төгсгөлийн цэг, таслалыг хасах.
 *
 * Fuzzy matching ХИЙХГҮЙ — нормчлолын дараа яг тэнцүү байх ёстой.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(MULTI_SPACE, ' ')
    .replace(EDGE_PUNCTUATION, '')
    .trim();
}

/**
 * Сурагчийн овог/нэр/ангийг нормчлох.
 *
 * Дараалал: NFC → trim → жижиг үсэг → давтах зайг нэг зай болгох → `ё` → `е`.
 * (Кирилл бичигт `ё`/`е`-г ялгаж бичих нь тогтворгүй тул нэгтгэнэ.)
 */
export function normalizeName(input: string): string {
  return input.normalize('NFC').trim().toLowerCase().replace(MULTI_SPACE, ' ').replace(/ё/g, 'е');
}

/** Нормчлолын дараа хоёр текст тэнцүү эсэх. */
export function textEquals(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

/** Хүлээн зөвшөөрөх хариултын жагсаалтад тухайн хариулт багтах эсэх. */
export function matchesAccepted(value: string, accepted: readonly string[]): boolean {
  const normalized = normalizeText(value);
  if (normalized === '') return false;
  return accepted.some((candidate) => normalizeText(candidate) === normalized);
}

// ---------------------------------------------------------------------------
// 2. SHA-256 (цэвэр TypeScript, синхрон)
// ---------------------------------------------------------------------------
//
// ASSUMPTION: Web Crypto-ийн `subtle.digest` нь async бөгөөд `http://` дээр
// (LAN горим) заримдаа хүрэхгүй байдаг. `studentKey`-г синхроноор, ямар ч
// орчинд ижил үр дүнтэй тооцохын тулд SHA-256-г шууд хэрэгжүүлэв.
// Хэрэгжилтийг FIPS 180-4-ийн тест вектороор `normalize.test.ts` шалгана.

// prettier-ignore
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** UTF-8 байт массивын SHA-256 хэш (32 байт). */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  // Нийт битийн урт = input.length * 8, 64-бит big-endian болгож бичнэ.
  const bitLenHi = Math.floor(input.length / 0x20000000);
  const bitLenLo = (input.length * 8) >>> 0;

  const paddedLength = (((input.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi, false);
  view.setUint32(paddedLength - 4, bitLenLo, false);

  // prettier-ignore
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, h[i]!, false);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** UTF-8 мөрийн SHA-256 хэшийг 64 тэмдэгт hex болгож буцаана. */
export function sha256Hex(message: string): string {
  return toHex(sha256Bytes(new TextEncoder().encode(message)));
}

// ---------------------------------------------------------------------------
// 3. studentKey
// ---------------------------------------------------------------------------

/**
 * Сурагчийн тогтвортой түлхүүр.
 *
 * `studentKey = sha256(normalizeName(овог) + "|" + normalizeName(нэр) + "|" + normalizeName(анги))`
 *
 * Зорилго: тайлан болон sync-д хувийн мэдээлэл дамжуулахгүй байх. Нэр өөрөө
 * `Submission` бичлэгт тусад нь хадгалагдана.
 */
export function computeStudentKey(lastName: string, firstName: string, className: string): string {
  const parts = [normalizeName(lastName), normalizeName(firstName), normalizeName(className)];
  return sha256Hex(parts.join('|'));
}

/**
 * Дурын мөрөөс 32-бит эерэг бүхэл тоо (FNV-1a). Асуултын дараалал холихдоо
 * ашиглах `seed` үүсгэхэд хэрэглэнэ — криптографийн зориулалтгүй.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
