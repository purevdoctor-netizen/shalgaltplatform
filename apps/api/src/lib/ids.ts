/**
 * Таамаглагдахгүй танигчид.
 */

import { customAlphabet, nanoid } from 'nanoid';

/** URL-д ээлтэй цагаан толгой (андуурч болох 0/O, 1/l тэмдэгтгүй). */
const EXAM_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';

/** `examId` — 12 тэмдэгт. 32¹² ≈ 1.15×10¹⁸ хувилбар. */
export const newExamId = customAlphabet(EXAM_ALPHABET, 12);

/** `teacherToken` — 32 тэмдэгт (a–z, A–Z, 0–9, -, _). ≈ 190 бит энтропи. */
export function newTeacherToken(): string {
  return nanoid(32);
}

/** Ерөнхий зориулалтын id (илгээлт, тайлан, дараалал). */
export function newId(prefix: string): string {
  return `${prefix}_${nanoid(16)}`;
}

/** QR багцын богино танигч (хэсэглэсэн QR-уудыг хооронд нь холбоно). */
export const newChunkId = customAlphabet(EXAM_ALPHABET, 6);
