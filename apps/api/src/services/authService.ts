/**
 * Нэвтрэлт — нууц үгийн хэш, сесс үүсгэх/шалгах.
 *
 * Нууц үгийг Node-ийн built-in `scrypt`-ээр хэшлэнэ (bcrypt/argon2 шиг native
 * хамаарал шаардахгүй — Windows дээр суулгах алдаа гарахгүй).
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { PrismaClient, User as PrismaUser } from '@prisma/client';
import type { User, UserRole } from '@shalgalt/shared';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// OWASP-ийн зөвлөмжид нийцсэн scrypt параметр
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Сесс хэдэн хоног хүчинтэй байх. */
export const SESSION_DAYS = 30;

/** Cookie-ийн нэр. */
export const SESSION_COOKIE = 'shalgalt_sid';

// ---------------------------------------------------------------------------
// Нууц үг
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await scrypt(password.normalize('NFC'), salt, KEY_LENGTH);
  return { hash: derived.toString('hex'), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize('NFC'), salt, KEY_LENGTH);
  } catch {
    return false;
  }
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

/**
 * Хүн уншиж/хэлж болохуйц түр нууц үг үүсгэнэ.
 * Андуурч болох тэмдэгт (0/O, 1/l/I) орохгүй.
 */
export function generateTempPassword(): string {
  const consonants = 'bdfghjkmnpqrstvwxz';
  const vowels = 'aeuy';
  const digits = '23456789';
  const pick = (source: string): string => {
    const index = randomBytes(1)[0]! % source.length;
    return source[index]!;
  };

  // жишээ: "peki-bo-4739"
  const syllable = () => `${pick(consonants)}${pick(vowels)}${pick(consonants)}${pick(vowels)}`;
  const number = Array.from({ length: 4 }, () => pick(digits)).join('');
  return `${syllable()}-${pick(consonants)}${pick(vowels)}-${number}`;
}

/** Нууц үгийн хамгийн бага шаардлага. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Нууц үг дор хаяж 8 тэмдэгт байх ёстой.';
  if (password.length > 200) return 'Нууц үг хэт урт байна.';
  if (!/[^\s]/.test(password)) return 'Нууц үг зөвхөн зайнаас бүрдэж болохгүй.';
  return null;
}

// ---------------------------------------------------------------------------
// Хэрэглэгчийг гадагш өгөх хэлбэр
// ---------------------------------------------------------------------------

export function toUser(row: PrismaUser & { _count?: { exams: number } }): User {
  const user: User = {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role as UserRole,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.email !== null) user.email = row.email;
  if (row.lastLoginAt !== null) user.lastLoginAt = row.lastLoginAt;
  if (row._count) user.examCount = row._count.exams;
  return user;
}

// ---------------------------------------------------------------------------
// Сесс
// ---------------------------------------------------------------------------

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreatedSession {
  /** Cookie-д тавих түүхий токен — зөвхөн энэ удаад л мэдэгдэнэ. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      createdAt: nowIso(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: nowIso(),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
    },
  });

  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** Cookie-ийн токеноос идэвхтэй хэрэглэгчийг олно. Хүчингүй бол `null`. */
export async function resolveSession(
  prisma: PrismaClient,
  token: string,
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (!session.user.isActive) {
    // Идэвхгүй болгосон данс — бүх сессийг нь хаана
    await prisma.session.deleteMany({ where: { userId: session.userId } }).catch(() => undefined);
    return null;
  }

  // `lastSeenAt`-ыг цагт нэг удаа шинэчилнэ (бичих ачааллыг багасгана)
  const lastSeen = new Date(session.lastSeenAt).getTime();
  if (Date.now() - lastSeen > 60 * 60 * 1000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: nowIso() } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role as UserRole,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export async function revokeSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.delete({ where: { id: hashSessionToken(token) } }).catch(() => undefined);
}

export async function revokeAllSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Хугацаа нь дууссан сессийг цэвэрлэнэ (эхлэхэд болон үе үе дуудна). */
export async function purgeExpiredSessions(prisma: PrismaClient): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: nowIso() } },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Нэвтрэх
// ---------------------------------------------------------------------------

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function login(
  prisma: PrismaClient,
  username: string,
  password: string,
): Promise<PrismaUser> {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(username) },
  });

  // Хэрэглэгч байхгүй ч ижил хэмжээний ажил хийж, "энэ нэр байна уу?" гэдгийг
  // хугацаагаар таахаас сэргийлнэ.
  const hash = user?.passwordHash ?? 'f'.repeat(128);
  const salt = user?.passwordSalt ?? '0'.repeat(32);
  const valid = await verifyPassword(password, hash, salt);

  if (!user || !valid) {
    throw new ApiError('UNAUTHORIZED', 'Нэвтрэх нэр эсвэл нууц үг буруу байна.');
  }
  if (!user.isActive) {
    throw new ApiError('FORBIDDEN', 'Таны данс идэвхгүй болсон байна. Админд хандана уу.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: nowIso() },
  });

  return user;
}

// ---------------------------------------------------------------------------
// Хэрэглэгч үүсгэх / удирдах (админ)
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  /** Хоосон бол түр нууц үг автоматаар үүсгэнэ. */
  password?: string;
  createdById?: string;
}

export async function createUser(
  prisma: PrismaClient,
  input: CreateUserInput,
): Promise<{ user: User; tempPassword: string | null }> {
  const username = normalizeUsername(input.username);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw ApiError.conflict(`"${username}" нэртэй хэрэглэгч аль хэдийн байна.`);
  }

  const generated = input.password ? null : generateTempPassword();
  const password = input.password ?? generated!;

  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const { hash, salt } = await hashPassword(password);
  const timestamp = nowIso();

  const row = await prisma.user.create({
    data: {
      id: newId('usr'),
      username,
      fullName: input.fullName.trim(),
      email: input.email?.trim() || null,
      role: input.role,
      passwordHash: hash,
      passwordSalt: salt,
      // Админ өөрөө нууц үг өгсөн ч эхний нэвтрэлтэд солиулна
      mustChangePassword: true,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdById: input.createdById ?? null,
    },
  });

  return { user: toUser(row), tempPassword: generated ?? password };
}

/** Нууц үг солих (хэрэглэгч өөрөө). */
export async function changeOwnPassword(
  prisma: PrismaClient,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('Хэрэглэгч олдсонгүй.');

  const valid = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!valid) throw ApiError.badRequest('Одоогийн нууц үг буруу байна.');

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const samePassword = await verifyPassword(newPassword, user.passwordHash, user.passwordSalt);
  if (samePassword) throw ApiError.badRequest('Шинэ нууц үг хуучинтайгаа ижил байна.');

  const { hash, salt } = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      updatedAt: nowIso(),
    },
  });
}

/** Нууц үг сэргээх (админ). Шинэ түр нууц үгийг буцаана. */
export async function resetPassword(
  prisma: PrismaClient,
  userId: string,
  password?: string,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('Хэрэглэгч олдсонгүй.');

  const newPassword = password ?? generateTempPassword();
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const { hash, salt } = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        mustChangePassword: true,
        updatedAt: nowIso(),
      },
    }),
    // Нууц үг солигдсон тул бүх идэвхтэй сессийг хаана
    prisma.session.deleteMany({ where: { userId } }),
  ]);

  return newPassword;
}

/** Систем дээр админ байгаа эсэх (эхний тохиргоог мэдэхэд). */
export async function hasAnyAdmin(prisma: PrismaClient): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: 'admin', isActive: true } });
  return count > 0;
}
