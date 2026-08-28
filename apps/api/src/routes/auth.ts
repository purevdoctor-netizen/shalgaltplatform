/**
 * `/api/auth` — нэвтрэх, гарах, өөрийн мэдээлэл, нууц үг солих.
 */

import { Router, type CookieOptions, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { env } from '../env';
import { asyncHandler } from '../middleware/errorHandler';
import { attachUser, requireAuth } from '../middleware/auth';
import { clientIp } from '../lib/http';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  changeOwnPassword,
  createSession,
  hasAnyAdmin,
  login,
  revokeAllSessions,
  revokeSession,
  toUser,
} from '../services/authService';

const loginSchema = z.object({
  username: z.string().min(1, 'Нэвтрэх нэрээ оруулна уу').max(60),
  password: z.string().min(1, 'Нууц үгээ оруулна уу').max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Одоогийн нууц үгээ оруулна уу').max(200),
  newPassword: z.string().min(8, 'Шинэ нууц үг дор хаяж 8 тэмдэгт байх ёстой').max(200),
});

/**
 * Нууц үг таах оролдлогоос хамгаална — 15 минутад 10 удаа.
 * Амжилттай нэвтэрсэн тохиолдлыг тоолохгүй.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.',
    },
  },
});

function cookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // LAN дотор HTTP ажилладаг тул зөвхөн production+HTTPS үед secure тавина
    secure: env.isProduction && env.webOrigins.some((origin) => origin.startsWith('https://')),
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function authRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(attachUser(prisma));

  // -------------------------------------------------------------------------
  // GET /api/auth/me — одоогийн хэрэглэгч (нэвтрээгүй бол user: null)
  // -------------------------------------------------------------------------
  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      if (!req.user) {
        // Систем дээр админ огт байхгүй бол клиент "эхний тохиргоо" гэж мэднэ
        const adminExists = await hasAnyAdmin(prisma);
        res.json({ user: null, needsSetup: !adminExists });
        return;
      }

      const row = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { _count: { select: { exams: true } } },
      });
      res.json({ user: row ? toUser(row) : null, needsSetup: false });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/auth/login
  // -------------------------------------------------------------------------
  router.post(
    '/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const input = loginSchema.parse(req.body);
      const user = await login(prisma, input.username, input.password);

      const agent = req.get('user-agent');
      const session = await createSession(prisma, user.id, {
        ...(agent ? { userAgent: agent } : {}),
        ip: clientIp(req),
      });

      res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      res.json({
        user: toUser(user),
        expiresInDays: SESSION_DAYS,
      });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/auth/logout
  // -------------------------------------------------------------------------
  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      if (req.sessionToken) await revokeSession(prisma, req.sessionToken);
      clearSessionCookie(res);
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/auth/logout-all — бүх төхөөрөмжөөс гарах
  // -------------------------------------------------------------------------
  router.post(
    '/logout-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      await revokeAllSessions(prisma, req.user!.id);
      clearSessionCookie(res);
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/auth/password — өөрийн нууц үгээ солих
  // -------------------------------------------------------------------------
  router.post(
    '/password',
    requireAuth,
    asyncHandler(async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      await changeOwnPassword(prisma, req.user!.id, input.currentPassword, input.newPassword);

      // Нууц үг солигдсон тул бусад бүх сессийг хааж, энэ төхөөрөмжид шинийг өгнө
      await revokeAllSessions(prisma, req.user!.id);
      const agent = req.get('user-agent');
      const session = await createSession(prisma, req.user!.id, {
        ...(agent ? { userAgent: agent } : {}),
        ip: clientIp(req),
      });
      res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));

      const row = await prisma.user.findUnique({ where: { id: req.user!.id } });
      res.json({ user: row ? toUser(row) : null });
    }),
  );

  return router;
}
