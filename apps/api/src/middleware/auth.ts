/**
 * Нэвтрэлтийн middleware.
 *
 * `attachUser`   — cookie байвал хэрэглэгчийг `req.user`-д тавина (хаахгүй)
 * `requireAuth`  — нэвтэрсэн байхыг шаардана
 * `requireAdmin` — админ эрхийг шаардана
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { SESSION_COOKIE, resolveSession, type SessionUser } from '../services/authService';

/** Хүсэлтээс сессийн токеныг гаргана (cookie эсвэл `Authorization: Session <token>`). */
export function extractSessionToken(req: Request): string | null {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === 'string' && cookie !== '') return cookie;

  const header = req.get('authorization');
  if (header && header.toLowerCase().startsWith('session ')) {
    const token = header.slice(8).trim();
    if (token !== '') return token;
  }
  return null;
}

/** Cookie байвал хэрэглэгчийг тодорхойлно. Байхгүй бол чимээгүй өнгөрнө. */
export function attachUser(prisma: PrismaClient): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractSessionToken(req);
    if (!token) {
      next();
      return;
    }

    resolveSession(prisma, token)
      .then((user) => {
        if (user) {
          req.user = user;
          req.sessionToken = token;
        }
        next();
      })
      .catch(next);
  };
}

/** Нэвтэрсэн байхыг шаардана. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('Нэвтэрнэ үү.'));
    return;
  }
  next();
};

/** Админ эрх шаардана. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('Нэвтэрнэ үү.'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(new ApiError('FORBIDDEN', 'Энэ үйлдэлд админ эрх шаардлагатай.'));
    return;
  }
  next();
};

/**
 * Нууц үгээ солих ёстой хэрэглэгчийг бусад үйлдэл рүү оруулахгүй.
 * (Нууц үг солих болон гарах route-д хэрэглэхгүй.)
 */
export const blockUntilPasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword) {
    next(
      new ApiError('FORBIDDEN', 'Үргэлжлүүлэхийн өмнө нууц үгээ солино уу.', {
        mustChangePassword: true,
      }),
    );
    return;
  }
  next();
};

export type { SessionUser };
