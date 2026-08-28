/**
 * LAN сервер (`pnpm lan`) — интернэтгүй ангид багшийн зөөврийн компьютер дээр
 * ажиллана.
 *
 * • Өөрийн SQLite сантай (`LAN_DATABASE_URL`)
 * • `0.0.0.0` дээр сонсож, LAN IP-г автоматаар илрүүлж консолд хэвлэнэ
 * • Интернэт гармагц цугласан илгээлтийг үндсэн сервер рүү `POST /api/sync`-ээр
 *   нийлүүлнэ (`UPSTREAM_API_URL` тохируулсан үед)
 */

import { mkdir } from 'node:fs/promises';
import { env } from './env';
import { createApp } from './app';
import { createPrismaClient } from './lib/prisma';
import { toSubmission } from './lib/mappers';
import { detectLanAddresses } from './lib/network';

export { detectLanAddresses };

const SYNC_INTERVAL_MS = 60_000;
const SYNC_BATCH_SIZE = 100;

/**
 * LAN сервер ӨӨРӨӨ клиент болж, дотоод илгээлтүүдээ үндсэн сервер рүү илгээнэ.
 * Амжилттай илгээгдсэн бичлэгийг `synced` болгож тэмдэглэнэ.
 */
async function pushToUpstream(prisma: ReturnType<typeof createPrismaClient>): Promise<void> {
  const upstream = env.UPSTREAM_API_URL.replace(/\/+$/, '');
  if (upstream === '') return;

  const pending = await prisma.submission.findMany({
    where: { syncStatus: 'pending' },
    take: SYNC_BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  });
  if (pending.length === 0) return;

  const records = pending.map((row) => {
    const submission = toSubmission(row);
    return {
      id: submission.id,
      entity: 'submission' as const,
      examId: submission.examId,
      payload: {
        id: submission.id,
        mode: submission.mode,
        lastName: submission.lastName,
        firstName: submission.firstName,
        className: submission.className,
        studentKey: submission.studentKey,
        answers: submission.answers,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        durationSec: submission.durationSec,
        deviceId: submission.deviceId,
        source: submission.source,
      },
    };
  });

  try {
    const response = await fetch(`${upstream}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: 'lan-server', records }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.warn(`[lan] Sync амжилтгүй: HTTP ${response.status}`);
      return;
    }

    const body = (await response.json()) as {
      results: { id: string; status: 'ok' | 'duplicate' | 'error' }[];
    };

    const settled = body.results
      .filter((result) => result.status === 'ok' || result.status === 'duplicate')
      .map((result) => result.id);

    if (settled.length > 0) {
      await prisma.submission.updateMany({
        where: { id: { in: settled } },
        data: { syncStatus: 'synced' },
      });
    }

    console.info(
      `[lan] Sync: ${settled.length}/${records.length} бичлэг үндсэн сервер рүү илгээгдлээ.`,
    );
  } catch (error) {
    // Интернэт байхгүй бол чимээгүй дахин оролдоно
    const message = error instanceof Error ? error.message : String(error);
    console.info(`[lan] Sync хойшлуулав (${message}).`);
  }
}

async function main(): Promise<void> {
  await mkdir(env.uploadDir, { recursive: true });

  const prisma = createPrismaClient(env.LAN_DATABASE_URL);
  const addresses = detectLanAddresses();
  const primary = addresses[0] ?? 'localhost';

  const app = createApp(prisma, {
    healthExtra: { role: 'lan', lanAddresses: addresses, upstream: env.UPSTREAM_API_URL || null },
  });

  app.listen(env.LAN_PORT, '0.0.0.0', () => {
    console.info('');
    console.info('  ✔ LAN сервер ажиллаж байна');
    console.info(`    Дотоод хаяг  : http://${primary}:${env.LAN_PORT}`);
    if (addresses.length > 1) {
      console.info(`    Бусад хаяг   : ${addresses.slice(1).join(', ')}`);
    }
    console.info(`    Шалгалт      : http://${primary}:${env.LAN_PORT}/exam/<examId>`);
    console.info(`    Өгөгдлийн сан: ${env.LAN_DATABASE_URL}`);
    console.info(
      `    Үндсэн сервер: ${env.UPSTREAM_API_URL || '— (тохируулаагүй, зөвхөн дотоод)'}`,
    );
    console.info('');
    console.info('  Сурагчид дээрх хаягийг QR-аар нээнэ. Ctrl+C дарж зогсооно.');
    console.info('');
  });

  if (env.UPSTREAM_API_URL !== '') {
    setInterval(() => {
      void pushToUpstream(prisma);
    }, SYNC_INTERVAL_MS).unref();
    void pushToUpstream(prisma);
  }

  const shutdown = (): void => {
    console.info('\n[lan] Зогсож байна…');
    prisma
      .$disconnect()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[lan] Эхлүүлэхэд алдаа гарлаа:', error);
  process.exit(1);
});
