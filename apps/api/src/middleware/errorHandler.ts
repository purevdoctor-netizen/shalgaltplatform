/**
 * Алдаа боловсруулагч + асинхрон route-ийн боодол.
 */

import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { env } from '../env';

/** `async` route handler-ийн алдааг Express рүү дамжуулна. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Тохирох route олдоогүй үед. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Ийм зам байхгүй: ${req.method} ${req.originalUrl}` },
  });
};

function zodMessage(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: zodMessage(error),
        details: error.issues,
      },
    });
    return;
  }

  if (error instanceof MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: tooLarge
          ? `Файл хэт том байна (дээд хэмжээ ${env.MAX_UPLOAD_MB}MB).`
          : `Файл байршуулах алдаа: ${error.message}`,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Ийм бичлэг аль хэдийн байна.' },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Хүссэн бичлэг олдсонгүй.' },
      });
      return;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[api] Гэнэтийн алдаа:', error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProduction ? 'Серверийн дотоод алдаа гарлаа.' : message,
    },
  });
};
