/**
 * Жишээ өгөгдөл ачаалах: `pnpm db:seed`
 *
 * `@shalgalt/shared`-ийн `seed-data.ts`-ыг ашиглана — тэнд байгаа 1 шалгалт,
 * 10 асуулт, 12 сурагчийн өгөгдөл тестүүдтэй яг ижил.
 */

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SEED_EXAM, buildSeedSubmissions } from '@shalgalt/shared';
// Монорепогийн үндэс дэх `.env`-ыг ачаална (импортын гаж нөлөө нь зориудынх).
import { env } from '../src/env';
import { toQuestionRow } from '../src/lib/mappers';
import { createUser } from '../src/services/authService';

const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

const SEED_TEACHER_USERNAME = 'demo.bagsh';

/**
 * Жишээ багшийн нууц үгийг ажиллах бүрд САНАМСАРГҮЙ үүсгэнэ.
 *
 * Урьд нь энд тогтмол утга бичээстэй байсан. Энэ файл нь эх кодын санд
 * байдаг тул — ялангуяа нээлттэй (public) repo дээр — тэр нууц үгийг хэн ч
 * уншиж, `pnpm db:seed` ажиллуулсан аль ч сервер рүү багшийн эрхээр нэвтрэх
 * боломжтой байв.
 *
 * Одоо нууц үг зөвхөн терминал дээр НЭГ УДАА хэвлэгдэнэ.
 */
const SEED_TEACHER_PASSWORD = `Demo${randomBytes(9).toString('base64url')}!1`;

async function main(): Promise<void> {
  console.info('[seed] Эхэлж байна…');

  // Дахин ачаалахад цэвэрлэнэ (cascade-аар асуулт, илгээлт хамт устана)
  await prisma.exam.deleteMany({ where: { id: SEED_EXAM.id } });

  // --- Жишээ багшийн данс ---
  let teacher = await prisma.user.findUnique({ where: { username: SEED_TEACHER_USERNAME } });
  const teacherCreated = teacher === null;
  if (!teacher) {
    const created = await createUser(prisma, {
      username: SEED_TEACHER_USERNAME,
      fullName: SEED_EXAM.teacherName,
      email: SEED_EXAM.teacherEmail,
      role: 'teacher',
      password: SEED_TEACHER_PASSWORD,
    });
    teacher = await prisma.user.findUnique({ where: { id: created.user.id } });
    console.info(`[seed] Жишээ багшийн данс үүслээ: ${SEED_TEACHER_USERNAME}`);
  }

  await prisma.exam.create({
    data: {
      id: SEED_EXAM.id,
      title: SEED_EXAM.title,
      subject: SEED_EXAM.subject,
      teacherName: SEED_EXAM.teacherName,
      teacherEmail: SEED_EXAM.teacherEmail,
      teacherToken: SEED_EXAM.teacherToken,
      ownerId: teacher?.id ?? null,
      examDate: SEED_EXAM.examDate,
      createdAt: SEED_EXAM.createdAt,
      updatedAt: SEED_EXAM.updatedAt,
      mode: SEED_EXAM.mode,
      status: SEED_EXAM.status,
      deliveryMode: SEED_EXAM.deliveryMode,
      passThreshold: SEED_EXAM.passThreshold,
      durationMin: SEED_EXAM.durationMin ?? null,
      shuffle: SEED_EXAM.shuffle,
      showAnswersToStudent: SEED_EXAM.showAnswersToStudent,
      onePerPage: SEED_EXAM.onePerPage,
      questions: {
        create: SEED_EXAM.questions.map((question) => {
          const row = toQuestionRow(question, SEED_EXAM.id);
          // `examId`-г relation дотор давхар өгөх боломжгүй
          const { examId: _examId, ...rest } = row;
          return rest;
        }),
      },
    },
  });
  console.info(`[seed] Шалгалт үүслээ: ${SEED_EXAM.title} (${SEED_EXAM.id})`);

  const createdAt = new Date().toISOString();
  let count = 0;

  for (const mode of ['pre', 'post'] as const) {
    for (const submission of buildSeedSubmissions(mode)) {
      await prisma.submission.create({
        data: {
          id: submission.id,
          examId: submission.examId,
          mode: submission.mode,
          studentKey: submission.studentKey,
          lastName: submission.lastName,
          firstName: submission.firstName,
          className: submission.className,
          answersJson: JSON.stringify(submission.answers),
          score: submission.score,
          maxScore: submission.maxScore,
          percent: submission.percent,
          passed: submission.passed,
          startedAt: submission.startedAt,
          submittedAt: submission.submittedAt,
          durationSec: submission.durationSec,
          deviceId: submission.deviceId,
          source: submission.source,
          syncStatus: submission.syncStatus,
          createdAt,
        },
      });
      count++;
    }
  }

  console.info(`[seed] ${count} илгээлт үүслээ.`);
  console.info('');
  console.info('  Жишээ багшийн данс:');
  console.info(`    Нэвтрэх нэр : ${SEED_TEACHER_USERNAME}`);
  if (teacherCreated) {
    console.info(`    Нууц үг     : ${SEED_TEACHER_PASSWORD}`);
    console.info('    ⚠ Энэ нууц үг ЗӨВХӨН ОДОО харагдана — хаа нэгтээ тэмдэглэж аваарай.');
    console.info('    (эхний нэвтрэлтэд солиулна)');
  } else {
    console.info('    Нууц үг     : (данс аль хэдийн байсан — өөрчлөгдөөгүй)');
  }
  console.info('');
  console.info('  Багшийн линк:');
  console.info(`    /teacher/${SEED_EXAM.id}?t=${SEED_EXAM.teacherToken}`);
  console.info('  Сурагчийн линк:');
  console.info(`    /exam/${SEED_EXAM.id}`);
  console.info('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error('[seed] Алдаа:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
