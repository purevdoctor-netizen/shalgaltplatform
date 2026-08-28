/**
 * Үндсэн API серверийн эхлэл цэг.
 */

import { env } from './env';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { createUser, hasAnyAdmin, purgeExpiredSessions } from './services/authService';

/**
 * Үүлэн орчинд интерактив CLI ажиллуулах боломжгүй тул эхний админыг
 * орчны хувьсагчаар үүсгэнэ. Админ аль хэдийн байвал юу ч хийхгүй.
 */
async function bootstrapAdmin(): Promise<void> {
  const username = env.BOOTSTRAP_ADMIN_USERNAME.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (username === '' || password === '') return;

  if (await hasAnyAdmin(prisma)) {
    console.info('[api] Админ данс аль хэдийн байна — BOOTSTRAP алгасав.');
    return;
  }

  try {
    const result = await createUser(prisma, {
      username,
      fullName: env.BOOTSTRAP_ADMIN_NAME,
      role: 'admin',
      password,
    });
    console.info('');
    console.info('  ✔ Эхний админ данс үүслээ');
    console.info(`    Нэвтрэх нэр : ${result.user.username}`);
    console.info('    Нууц үг     : (BOOTSTRAP_ADMIN_PASSWORD-д зааснаар)');
    console.info('    ⚠ Эхний нэвтрэлтэд солино. Дараа нь BOOTSTRAP_* хувьсагчийг устгана уу.');
    console.info('');
  } catch (error) {
    console.error('[api] Админ үүсгэж чадсангүй:', error instanceof Error ? error.message : error);
  }
}

async function main(): Promise<void> {
  await bootstrapAdmin();

  // Хугацаа дууссан сессийг цэвэрлэнэ
  const purged = await purgeExpiredSessions(prisma).catch(() => 0);
  if (purged > 0) console.info(`[api] ${purged} хугацаа дууссан сесс цэвэрлэгдлээ.`);

  const app = createApp(prisma);

  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    console.info('');
    console.info('  ✔ API сервер ажиллаж байна');
    console.info(`    Хаяг          : http://${env.API_HOST}:${env.API_PORT}`);
    console.info(`    Эрүүл мэнд    : http://localhost:${env.API_PORT}/api/health`);
    console.info(`    Өгөгдлийн сан : ${env.DATABASE_PROVIDER} — ${env.DATABASE_URL}`);
    console.info(`    Зөвшөөрсөн web: ${env.webOrigins.join(', ')}`);
    console.info('');
  });

  const shutdown = (signal: string): void => {
    console.info(`\n[api] ${signal} хүлээн авлаа, зогсоож байна…`);
    server.close(() => {
      prisma
        .$disconnect()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
    // 10 секундэд амжаагүй бол албадан зогсооно
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[api] Эхлүүлэхэд алдаа гарлаа:', error);
  process.exit(1);
});
