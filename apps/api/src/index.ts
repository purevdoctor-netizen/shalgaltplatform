/**
 * Үндсэн API серверийн эхлэл цэг.
 */

import { env } from './env';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import {
  createUser,
  hasAnyAdmin,
  hashPassword,
  normalizeUsername,
  purgeExpiredSessions,
  revokeAllSessions,
  validatePasswordStrength,
} from './services/authService';

/**
 * Үүлэн орчинд интерактив CLI ажиллуулах боломжгүй тул эхний админыг
 * орчны хувьсагчаар үүсгэнэ.
 *
 * `BOOTSTRAP_ADMIN_RESET=true` үед данс аль хэдийн байсан ч нууц үгийг нь
 * дарж бичнэ — админ нууц үгээ мартсан үед сэргээх цорын ганц арга
 * (үүлэн орчинд CLI ажиллуулах боломжгүй).
 *
 * Юу ч хийсэн БҮРД логт тодорхой бичнэ. Эс бөгөөс "нууц үг буруу" гэсэн
 * алдаа гарахад шалтгааныг олох аргагүй болдог.
 */
async function bootstrapAdmin(): Promise<void> {
  const username = env.BOOTSTRAP_ADMIN_USERNAME.trim();

  // Веб маягтаас хуулж наахад төгсгөлд нь зай орох нь маш элбэг. Тэр зай
  // нууц үгийн хэсэг болж, дараа нь гараар шивсэн нууц үг таарахаа больдог.
  const password = env.BOOTSTRAP_ADMIN_PASSWORD.trim();

  if (username === '' || password === '') {
    console.info(
      '[api] BOOTSTRAP: USERNAME эсвэл PASSWORD хоосон байна — админ үүсгэхийг алгасав.',
    );
    return;
  }

  const weak = validatePasswordStrength(password);
  if (weak) {
    console.error(`[api] BOOTSTRAP: нууц үг тохирохгүй — ${weak}`);
    return;
  }

  console.info(`[api] BOOTSTRAP: нэр="${username}", нууц үгийн урт=${password.length}`);

  const existing = await prisma.user.findUnique({
    where: { username: normalizeUsername(username) },
  });

  // --- Данс байгаа ---
  if (existing) {
    /**
     * Тохируулга ДУУСААГҮЙ (`mustChangePassword` хэвээр) байвал орчны
     * хувьсагч дахь нууц үгийг ЭРХ ДЭЭД гэж үзээд дахин тааруулна.
     *
     * Учир нь: веб маягтад нууц үг наахад төгсгөлд зай орох нь элбэг.
     * Тэр зайтай нууц үг хадгалагдчихаад, хүн зайгүйгээр шивэхэд
     * "нууц үг буруу" гэж гардаг — шалтгааныг нь олох бараг боломжгүй.
     *
     * Хэрэглэгч апп дотроо нууц үгээ нэг л удаа сольмогц
     * `mustChangePassword` false болох тул үүнээс хойш ЭНД ХҮРЭХГҮЙ —
     * сервер дахин асаахад нууц үг буцаж солигдох аюул байхгүй.
     */
    const setupIncomplete = existing.mustChangePassword;

    if (!env.BOOTSTRAP_ADMIN_RESET && !setupIncomplete) {
      console.info(`[api] BOOTSTRAP: "${username}" данс бэлэн — алгасав.`);
      console.info('[api]   Нууц үгээ мартсан бол BOOTSTRAP_ADMIN_RESET=true болгож дахин асаана уу.');
      return;
    }

    console.info(
      `[api] BOOTSTRAP: нууц үгийг дахин тааруулж байна ` +
        `(${env.BOOTSTRAP_ADMIN_RESET ? 'RESET=true' : 'эхний нэвтрэлт хийгдээгүй'}).`,
    );

    const { hash, salt } = await hashPassword(password);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        role: 'admin',
        isActive: true,
        mustChangePassword: true,
      },
    });
    // Хуучин сессүүдийг тасална — нууц үг сэргээсэн бол өмнөх нэвтрэлт хүчингүй
    await revokeAllSessions(prisma, existing.id);

    console.info('');
    console.info(`  ✔ "${username}" дансны нууц үгийг дахин тааруулав`);
    console.info(`    Нэвтрэх нэр : ${normalizeUsername(username)}`);
    console.info(`    Нууц үг     : BOOTSTRAP_ADMIN_PASSWORD дахь ${password.length} тэмдэгт`);
    console.info('    ⚠ Нэвтэрч, нууц үгээ сольсны дараа BOOTSTRAP_ADMIN_PASSWORD-ыг УСТГАНА УУ.');
    console.info('');
    return;
  }

  // --- Данс байхгүй: өөр админ байгаа эсэхийг шалгаад үүсгэнэ ---
  if (await hasAnyAdmin(prisma)) {
    console.info(`[api] BOOTSTRAP: "${username}" алга ч ӨӨР админ данс байна — алгасав.`);
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
