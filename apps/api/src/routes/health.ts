/**
 * `GET /api/health` — эрүүл мэндийн шалгалт. Клиентийн sync engine 30 секунд
 * тутам энэ хаяг руу хандаж онлайн эсэхээ мэдэрнэ.
 */

import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { env } from '../env';
import { asyncHandler } from '../middleware/errorHandler';
import { detectLanAddresses } from '../lib/network';

const startedAt = Date.now();

// Сүлжээний хаяг ховор өөрчлөгддөг тул нэг удаа тооцоод кэшлэнэ
let cachedAddresses: string[] | null = null;
let cachedAt = 0;

function lanAddresses(): string[] {
  if (cachedAddresses === null || Date.now() - cachedAt > 60_000) {
    cachedAddresses = detectLanAddresses();
    cachedAt = Date.now();
  }
  return cachedAddresses;
}

export function healthRouter(prisma: PrismaClient, extra: Record<string, unknown> = {}): Router {
  const router = Router();

  /**
   * Хөнгөн "амьд эсэх" шалгалт — өгөгдлийн санд ХАНДАХГҮЙ.
   *
   * Үнэгүй үүлэн тарифт сервер удаан ажиллахгүй бол унтдаг. Гадны
   * "uptime pinger" энэ хаягийг цохиж сэрүүн байлгана. Сан руу хандахгүй
   * учир Neon зэрэг сангийн үнэгүй compute-цагийг зарцуулахгүй.
   */
  router.get('/ping', (_req, res) => {
    res.json({ ok: true, at: new Date().toISOString() });
  });

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      // `SELECT 1` нь хоосон (migration хийгээгүй) сан дээр ч амжилттай болдог тул
      // бодит хүснэгт рүү хандаж схем бэлэн эсэхийг шалгана.
      let database = 'ok';
      try {
        await prisma.exam.count();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        database = /does not exist|no such table|P2021/i.test(message)
          ? 'error: migration хийгээгүй байна (`pnpm db:deploy` ажиллуулна уу)'
          : `error: ${message}`;
      }

      /**
       * Систем тохируулагдсан эсэх — админ данс үүссэн үү.
       *
       * Зөвхөн ТОО буцаана: нэр, имэйл, нууц үгийн талаар юу ч задруулахгүй.
       * Үүнгүйгээр "нэвтэрч чадахгүй байна" гэсэн гомдлыг оношлох арга
       * байхгүй — данс огт үүсээгүй юү, эсвэл нууц үг л буруу юү гэдгийг
       * ялгах боломжгүй болдог.
       */
      let setup: Record<string, unknown> = { checked: false };
      try {
        const [admins, users] = await Promise.all([
          prisma.user.count({ where: { role: 'admin', isActive: true } }),
          prisma.user.count(),
        ]);
        setup = { checked: true, activeAdmins: admins, totalUsers: users };
      } catch {
        // Хүснэгт байхгүй бол дээрх `database` талбарт аль хэдийн тусгагдсан
      }

      res.json({
        status: database === 'ok' ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        provider: env.DATABASE_PROVIDER,
        database,
        setup,
        /** Серверийн LAN хаягууд — QR кодод зөв хаяг санал болгоход хэрэглэнэ. */
        lanAddresses: lanAddresses(),
        ...extra,
      });
    }),
  );

  return router;
}
