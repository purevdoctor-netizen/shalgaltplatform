/**
 * `/api/admin` — зөвхөн админ. Багшийн данс нээх, идэвхгүй болгох,
 * нууц үг сэргээх, устгах.
 */

import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../lib/errors';
import { param } from '../lib/http';
import { asyncHandler } from '../middleware/errorHandler';
import { attachUser, requireAdmin } from '../middleware/auth';
import {
  createUser,
  normalizeUsername,
  resetPassword,
  revokeAllSessions,
  toUser,
} from '../services/authService';
import { sendTestEmail, verifySmtp } from '../services/emailService';

const smtpTestSchema = z.object({
  to: z.string().email('Имэйл хаяг буруу байна').max(320).optional(),
});

const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Нэвтрэх нэр дор хаяж 3 тэмдэгт байна')
    .max(60)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Нэвтрэх нэр зөвхөн латин үсэг, тоо, цэг, доогуур зураас, зураас агуулна',
    ),
  fullName: z.string().min(1, 'Овог нэрийг оруулна уу').max(200),
  email: z.string().email('Имэйл хаяг буруу байна').max(320).optional().or(z.literal('')),
  role: z.enum(['admin', 'teacher']).default('teacher'),
  /** Хоосон бол систем түр нууц үг үүсгэнэ. */
  password: z.string().min(8).max(200).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email('Имэйл хаяг буруу байна').max(320).optional().or(z.literal('')),
  role: z.enum(['admin', 'teacher']).optional(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Нууц үг дор хаяж 8 тэмдэгт байна').max(200).optional(),
});

/** Сүүлийн идэвхтэй админыг эрхгүй/идэвхгүй болгохоос сэргийлнэ. */
async function assertNotLastAdmin(
  prisma: PrismaClient,
  userId: string,
  action: string,
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== 'admin' || !target.isActive) return;

  const admins = await prisma.user.count({ where: { role: 'admin', isActive: true } });
  if (admins <= 1) {
    throw ApiError.conflict(
      `Системд ганц админ үлдсэн тул ${action} боломжгүй. Эхлээд өөр админ нэмнэ үү.`,
    );
  }
}

export function adminRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(attachUser(prisma));
  router.use(requireAdmin);

  // -------------------------------------------------------------------------
  // GET /api/admin/users
  // -------------------------------------------------------------------------
  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        include: { _count: { select: { exams: true } } },
      });
      res.json({ users: rows.map(toUser) });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/admin/users — багшийн данс нээх
  // -------------------------------------------------------------------------
  router.post(
    '/users',
    asyncHandler(async (req, res) => {
      const input = createUserSchema.parse(req.body);

      const result = await createUser(prisma, {
        username: input.username,
        fullName: input.fullName,
        role: input.role,
        createdById: req.user!.id,
        ...(input.email ? { email: input.email } : {}),
        ...(input.password ? { password: input.password } : {}),
      });

      // ⚠ `tempPassword` нь ЗӨВХӨН энэ хариултад буцна — дахин харах боломжгүй
      res.status(201).json(result);
    }),
  );

  // -------------------------------------------------------------------------
  // PATCH /api/admin/users/:id
  // -------------------------------------------------------------------------
  router.patch(
    '/users/:id',
    asyncHandler(async (req, res) => {
      const userId = param(req, 'id');
      const input = updateUserSchema.parse(req.body);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw ApiError.notFound('Хэрэглэгч олдсонгүй.');

      // Өөрийгөө идэвхгүй болгох / эрхээ бууруулахаас сэргийлнэ
      if (userId === req.user!.id) {
        if (input.isActive === false) {
          throw ApiError.badRequest('Өөрийгөө идэвхгүй болгох боломжгүй.');
        }
        if (input.role && input.role !== 'admin') {
          throw ApiError.badRequest('Өөрийн админ эрхийг өөрөө бууруулах боломжгүй.');
        }
      }

      if (input.isActive === false) await assertNotLastAdmin(prisma, userId, 'идэвхгүй болгох');
      if (input.role === 'teacher') await assertNotLastAdmin(prisma, userId, 'эрхийг бууруулах');

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date().toISOString(),
        },
        include: { _count: { select: { exams: true } } },
      });

      // Идэвхгүй болгосон бол бүх сессийг нь таслана
      if (input.isActive === false) await revokeAllSessions(prisma, userId);

      res.json({ user: toUser(updated) });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/admin/users/:id/reset-password
  // -------------------------------------------------------------------------
  router.post(
    '/users/:id/reset-password',
    asyncHandler(async (req, res) => {
      const userId = param(req, 'id');
      const input = resetPasswordSchema.parse(req.body ?? {});
      const tempPassword = await resetPassword(prisma, userId, input.password);
      res.json({ tempPassword });
    }),
  );

  // -------------------------------------------------------------------------
  // DELETE /api/admin/users/:id
  //   Шалгалттай багшийг устгахгүй — идэвхгүй болгохыг зөвлөнө.
  // -------------------------------------------------------------------------
  router.delete(
    '/users/:id',
    asyncHandler(async (req, res) => {
      const userId = param(req, 'id');

      if (userId === req.user!.id) {
        throw ApiError.badRequest('Өөрийгөө устгах боломжгүй.');
      }
      await assertNotLastAdmin(prisma, userId, 'устгах');

      const examCount = await prisma.exam.count({ where: { ownerId: userId } });
      if (examCount > 0) {
        throw ApiError.conflict(
          `Энэ багш ${examCount} шалгалттай тул устгах боломжгүй. ` +
            'Оронд нь идэвхгүй болгоно уу (шалгалт, тайлан хадгалагдана).',
        );
      }

      await prisma.user.delete({ where: { id: userId } });
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/admin/overview — товч тойм
  // -------------------------------------------------------------------------
  router.get(
    '/overview',
    asyncHandler(async (_req, res) => {
      const [teachers, admins, inactive, exams, submissions] = await Promise.all([
        prisma.user.count({ where: { role: 'teacher', isActive: true } }),
        prisma.user.count({ where: { role: 'admin', isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
        prisma.exam.count(),
        prisma.submission.count({ where: { syncStatus: { not: 'conflict' } } }),
      ]);
      res.json({ teachers, admins, inactive, exams, submissions });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/admin/exams — бүх шалгалт (эзэмшигчтэй нь)
  // -------------------------------------------------------------------------
  router.get(
    '/exams',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.exam.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          subject: true,
          examDate: true,
          mode: true,
          status: true,
          deliveryMode: true,
          teacherName: true,
          createdAt: true,
          owner: { select: { id: true, username: true, fullName: true } },
          _count: { select: { submissions: true } },
        },
      });

      res.json({
        exams: rows.map((row) => ({
          id: row.id,
          title: row.title,
          subject: row.subject,
          examDate: row.examDate,
          mode: row.mode,
          status: row.status,
          deliveryMode: row.deliveryMode,
          teacherName: row.teacherName,
          createdAt: row.createdAt,
          owner: row.owner,
          submissionCount: row._count.submissions,
        })),
      });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/admin/smtp — имэйлийн тохиргоо ажиллаж байгаа эсэх
  // -------------------------------------------------------------------------
  router.get(
    '/smtp',
    asyncHandler(async (_req, res) => {
      res.json(await verifySmtp());
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/admin/smtp/test — өөрийн хаяг руу туршилтын захиа
  // -------------------------------------------------------------------------
  router.post(
    '/smtp/test',
    asyncHandler(async (req, res) => {
      const input = smtpTestSchema.parse(req.body ?? {});

      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true },
      });
      const to = input.to ?? me?.email;

      if (!to) {
        throw ApiError.badRequest(
          'Хүлээн авагчийн имэйл заагаагүй байна. Өөрийн дансандаа имэйл нэмнэ үү.',
        );
      }

      const result = await sendTestEmail(to);
      res.status(result.ok ? 200 : 502).json(result);
    }),
  );

  // -------------------------------------------------------------------------
  // Нэвтрэх нэр чөлөөтэй эсэхийг шалгах (маягт бөглөж байхад)
  // -------------------------------------------------------------------------
  router.get(
    '/username-available',
    asyncHandler(async (req, res) => {
      const raw = req.query['username'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        throw ApiError.badRequest('`username` шаардлагатай.');
      }
      const existing = await prisma.user.findUnique({
        where: { username: normalizeUsername(raw) },
        select: { id: true },
      });
      res.json({ available: existing === null });
    }),
  );

  return router;
}
