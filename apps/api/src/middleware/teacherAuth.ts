/**
 * Шалгалтын эрхийн шалгалт.
 *
 * Дараах гурван замын АЛЬ НЭГ нь хангагдвал зөвшөөрнө:
 *   1. Админ нэвтэрсэн           → бүх шалгалт
 *   2. Эзэмшигч багш нэвтэрсэн   → өөрийн шалгалт
 *   3. Зөв `teacherToken`        → хуваалцах линк (`?t=…`)
 *
 * (3) нь дансны системээс өмнөх өгөгдөлтэй нийцтэй байх, мөн хамтран ажиллах
 * багшид линк дамжуулах зорилготой. Хүсвэл `DISABLE_SHARE_TOKEN=true`-гээр хаана.
 */

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { env } from '../env';

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Хүсэлтээс хуваалцах токеныг гаргаж авна. */
export function extractToken(req: Request): string | null {
  const query = req.query['t'];
  if (typeof query === 'string' && query !== '') return query;

  const header = req.get('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    if (token !== '') return token;
  }
  return null;
}

/** Тухайн хэрэглэгч/токен энэ шалгалтад эрхтэй эсэх. */
export function canAccessExam(
  req: Request,
  exam: { ownerId: string | null; teacherToken: string },
): boolean {
  const user = req.user;

  if (user) {
    if (user.role === 'admin') return true;
    if (exam.ownerId !== null && exam.ownerId === user.id) return true;
  }

  if (!env.DISABLE_SHARE_TOKEN) {
    const token = extractToken(req);
    if (token && constantTimeEquals(exam.teacherToken, token)) return true;
  }

  return false;
}

function denied(req: Request): ApiError {
  return req.user
    ? new ApiError('FORBIDDEN', 'Энэ шалгалтад хандах эрхгүй байна.')
    : ApiError.unauthorized('Нэвтэрнэ үү, эсвэл зөв удирдах линк ашиглана уу.');
}

/** `/api/exams/:id/…` доорх багшийн үйлдлүүдийг хамгаална. */
export function requireTeacher(prisma: PrismaClient, paramName = 'id'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const examId = req.params[paramName];
    if (!examId) {
      next(ApiError.badRequest('Шалгалтын дугаар заагаагүй байна.'));
      return;
    }

    prisma.exam
      .findUnique({
        where: { id: examId },
        select: { id: true, ownerId: true, teacherToken: true },
      })
      .then((exam) => {
        if (!exam) {
          next(ApiError.notFound('Ийм шалгалт олдсонгүй.'));
          return;
        }
        if (!canAccessExam(req, exam)) {
          next(denied(req));
          return;
        }
        req.examId = exam.id;
        next();
      })
      .catch(next);
  };
}

/** Тайлангийн route-д (`/api/reports/:id`) — тайлангаас шалгалт руу очиж шалгана. */
export function requireTeacherForReport(prisma: PrismaClient, paramName = 'id'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const reportId = req.params[paramName];
    if (!reportId) {
      next(ApiError.badRequest('Тайлангийн дугаар заагаагүй байна.'));
      return;
    }

    prisma.report
      .findUnique({
        where: { id: reportId },
        select: {
          id: true,
          examId: true,
          exam: { select: { ownerId: true, teacherToken: true } },
        },
      })
      .then((report) => {
        if (!report) {
          next(ApiError.notFound('Ийм тайлан олдсонгүй.'));
          return;
        }
        if (!canAccessExam(req, report.exam)) {
          next(denied(req));
          return;
        }
        req.examId = report.examId;
        next();
      })
      .catch(next);
  };
}
