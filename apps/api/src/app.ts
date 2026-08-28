/**
 * Express аппликейшн үүсгэгч. `index.ts` (үндсэн) болон `lan.ts` (LAN сервер)
 * хоёулаа энэ функцийг ашиглана.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import { env } from './env';
import { apiRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { examsRouter } from './routes/exams';
import { healthRouter } from './routes/health';
import { reportsRouter } from './routes/reports';
import { syncRouter } from './routes/sync';

/** Хувийн сүлжээний (LAN) origin эсэх. */
const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      // Origin байхгүй = ижил origin, curl, эсвэл нэг домэйн дээрх nginx
      if (!origin) {
        callback(null, true);
        return;
      }
      if (env.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (env.CORS_ALLOW_LAN && LAN_ORIGIN.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: "${origin}" origin зөвшөөрөгдөөгүй байна.`));
    },
    // Сесс нь cookie-гоор явдаг тул cross-origin үед credentials шаардлагатай
    credentials: true,
    maxAge: 600,
  };
}

export interface AppOptions {
  /** `/api/health`-д нэмж буцаах мэдээлэл (жишээ нь LAN IP). */
  healthExtra?: Record<string, unknown>;
}

export function createApp(prisma: PrismaClient, options: AppOptions = {}): Express {
  const app = express();

  // nginx/Docker дотор бодит IP-г таних (rate limit зөв ажиллана)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // API нь HTML буцаадаггүй тул CSP шаардлагагүй; файл татахад саад болно.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(cors(buildCorsOptions()));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use('/api', apiRateLimiter);

  app.use('/api/health', healthRouter(prisma, options.healthExtra ?? {}));
  app.use('/api/auth', authRouter(prisma));
  app.use('/api/admin', adminRouter(prisma));
  app.use('/api/exams', examsRouter(prisma));
  app.use('/api/sync', syncRouter(prisma));
  app.use('/api/reports', reportsRouter(prisma));

  // ---------------------------------------------------------------------------
  // Вэб апп-ыг ижил портоор үйлчлэх (SERVE_WEB_DIR тохируулсан үед)
  //
  // Ингэснээр LAN/дотоод сүлжээнд nginx эсвэл Docker шаардлагагүй — ганц Node
  // процесс API болон PWA хоёуланг нь өгнө. CORS ч хэрэггүй болно (ижил origin).
  // ---------------------------------------------------------------------------
  const webDir = env.webDir;

  if (webDir !== null) {
    if (!existsSync(join(webDir, 'index.html'))) {
      console.warn(
        `[api] SERVE_WEB_DIR="${webDir}" дотор index.html олдсонгүй. ` +
          'Эхлээд `pnpm build` ажиллуулна уу.',
      );
    }

    // Hash-тай асет — удаан кэш. Бусад нь шинэчлэлт шууд хүрэхээр кэшлэгдэхгүй.
    app.use(
      '/assets',
      express.static(join(webDir, 'assets'), {
        immutable: true,
        maxAge: '1y',
        fallthrough: false,
      }),
    );

    app.use(
      express.static(webDir, {
        index: false,
        etag: true,
        setHeaders(res, filePath) {
          if (/(?:sw\.js|registerSW\.js|manifest\.webmanifest)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      }),
    );

    // SPA fallback — /api-аас бусад бүх зам index.html руу
    app.get(/^(?!\/api\/).*/, (_req, res, next) => {
      res.sendFile(join(webDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
