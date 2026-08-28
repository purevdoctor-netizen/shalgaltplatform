/**
 * `/api/exams` — шалгалт үүсгэх, унших, засах, горим солих, экспорт.
 */

import { Router } from 'express';
import multer from 'multer';
import type { PrismaClient } from '@prisma/client';
import { env } from '../env';
import { ApiError } from '../lib/errors';
import { toPublicExam } from '../lib/mappers';
import { param } from '../lib/http';
import { asyncHandler } from '../middleware/errorHandler';
import { canAccessExam, requireTeacher } from '../middleware/teacherAuth';
import { attachUser, blockUntilPasswordChanged, requireAuth } from '../middleware/auth';
import { bulkRateLimiter } from '../middleware/rateLimit';
import {
  createExamSchema,
  emailReportSchema,
  mineQuerySchema,
  reportStatsSchema,
  setModeSchema,
  submissionInputSchema,
  updateExamSchema,
} from '../schemas';
import {
  countSubmissions,
  createExam,
  deleteExam,
  getExam,
  switchToPost,
  updateExam,
} from '../services/examService';
import {
  deleteSubmission,
  findMySubmissions,
  listConflicts,
  listSubmissions,
  saveSubmission,
  submissionsToCsv,
} from '../services/submissionService';
import { listReports, saveReport } from '../services/reportService';
import { listEmailQueue, sendReportEmail } from '../services/emailService';
import type { ReportStats } from '@shalgalt/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

export function examsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const teacher = requireTeacher(prisma);

  // Бүх route-д нэвтэрсэн хэрэглэгчийг тодорхойлно (заавал шаардахгүй —
  // сурагчийн route-ууд нэвтрэлтгүй ажиллана).
  router.use(attachUser(prisma));

  // -------------------------------------------------------------------------
  // GET /api/exams — өөрийн шалгалтууд (админ бол бүгд)
  // -------------------------------------------------------------------------
  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = req.user!;
      const rows = await prisma.exam.findMany({
        where: user.role === 'admin' ? {} : { ownerId: user.id },
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
          teacherToken: true,
          ownerId: true,
          createdAt: true,
          _count: { select: { submissions: true, questions: true } },
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
          teacherToken: row.teacherToken,
          ownerId: row.ownerId,
          createdAt: row.createdAt,
          questionCount: row._count.questions,
          submissionCount: row._count.submissions,
        })),
      });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/exams — шалгалт үүсгэх (нэвтэрсэн байх ёстой)
  // -------------------------------------------------------------------------
  router.post(
    '/',
    requireAuth,
    blockUntilPasswordChanged,
    asyncHandler(async (req, res) => {
      const input = createExamSchema.parse(req.body);
      const exam = await createExam(prisma, input, req.user!.id);
      res.status(201).json({ exam });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/exams/:id
  //   токентой  → бүрэн (зөв хариулттай)
  //   токенгүй  → сурагчийн хувилбар (зөв хариултгүй)
  // -------------------------------------------------------------------------
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const exam = await getExam(prisma, param(req, 'id'));

      // Эзэмшигч / админ / зөв хуваалцах токен → бүрэн хувилбар
      if (canAccessExam(req, { ownerId: exam.ownerId ?? null, teacherToken: exam.teacherToken })) {
        const counts = await countSubmissions(prisma, exam.id);
        res.json({ exam, counts, isTeacher: true });
        return;
      }

      if (exam.status === 'draft') {
        throw ApiError.notFound('Энэ шалгалт хараахан нээгдээгүй байна.');
      }

      res.json({ exam: toPublicExam(exam), isTeacher: false });
    }),
  );

  // -------------------------------------------------------------------------
  // PATCH /api/exams/:id  [token]
  // -------------------------------------------------------------------------
  router.patch(
    '/:id',
    teacher,
    asyncHandler(async (req, res) => {
      const input = updateExamSchema.parse(req.body);
      const exam = await updateExam(prisma, param(req, 'id'), input);
      res.json({ exam });
    }),
  );

  // -------------------------------------------------------------------------
  // DELETE /api/exams/:id  [token]
  // -------------------------------------------------------------------------
  router.delete(
    '/:id',
    teacher,
    asyncHandler(async (req, res) => {
      await deleteExam(prisma, param(req, 'id'));
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/exams/:id/mode  {mode:'post'}  [token]
  // -------------------------------------------------------------------------
  router.post(
    '/:id/mode',
    teacher,
    asyncHandler(async (req, res) => {
      setModeSchema.parse(req.body);
      const { exam, preCount } = await switchToPost(prisma, param(req, 'id'));
      res.json({ exam, preCount });
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/exams/:id/submissions — сурагчийн илгээлт (токен шаардахгүй)
  // -------------------------------------------------------------------------
  router.post(
    '/:id/submissions',
    bulkRateLimiter,
    asyncHandler(async (req, res) => {
      const input = submissionInputSchema.parse(req.body);
      const exam = await getExam(prisma, param(req, 'id'));

      if (exam.status === 'draft') {
        throw ApiError.notFound('Энэ шалгалт хараахан нээгдээгүй байна.');
      }
      if (input.mode !== exam.mode) {
        throw ApiError.conflict(
          `Шалгалт одоо ${exam.mode === 'pre' ? 'ӨМНӨХ' : 'ДАРААХ'} горимд байна.`,
          { currentMode: exam.mode },
        );
      }

      const result = await saveSubmission(prisma, exam, input);

      if (result.status === 'duplicate') {
        res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: 'Та энэ шалгалтыг аль хэдийн өгсөн байна.',
          },
          submission: exam.showAnswersToStudent ? result.submission : undefined,
          percent: result.submission.percent,
          passed: result.submission.passed,
        });
        return;
      }

      res.status(201).json({ submission: result.submission });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/exams/:id/submissions  [token]
  // -------------------------------------------------------------------------
  router.get(
    '/:id/submissions',
    teacher,
    asyncHandler(async (req, res) => {
      const mode = req.query['mode'];
      const filter = mode === 'pre' || mode === 'post' ? mode : undefined;
      const [submissions, conflicts] = await Promise.all([
        listSubmissions(prisma, param(req, 'id'), filter),
        listConflicts(prisma, param(req, 'id')),
      ]);
      res.json({ submissions, conflicts });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/exams/:id/submissions/mine?studentKey=
  //   Сурагч өөрийн (ялангуяа pre) дүнгээ авна.
  // -------------------------------------------------------------------------
  router.get(
    '/:id/submissions/mine',
    asyncHandler(async (req, res) => {
      const query = mineQuerySchema.parse(req.query);
      const submissions = await findMySubmissions(
        prisma,
        param(req, 'id'),
        query.studentKey,
        query.mode,
      );
      res.json({ submissions });
    }),
  );

  // -------------------------------------------------------------------------
  // DELETE /api/exams/:id/submissions/:submissionId  [token]
  //   Давхардсан бичлэг устгах.
  // -------------------------------------------------------------------------
  router.delete(
    '/:id/submissions/:submissionId',
    teacher,
    asyncHandler(async (req, res) => {
      await deleteSubmission(prisma, param(req, 'id'), param(req, 'submissionId'));
      res.status(204).end();
    }),
  );

  // -------------------------------------------------------------------------
  // POST /api/exams/:id/reports  multipart: stats(json) + docx  [token]
  // -------------------------------------------------------------------------
  router.post(
    '/:id/reports',
    teacher,
    upload.single('docx'),
    asyncHandler(async (req, res) => {
      const rawStats = req.body?.stats;
      if (typeof rawStats !== 'string') {
        throw ApiError.badRequest('`stats` талбар (JSON мөр) шаардлагатай.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawStats);
      } catch {
        throw ApiError.badRequest('`stats` талбарыг JSON болгож задлаж чадсангүй.');
      }
      reportStatsSchema.parse(parsed);

      const report = await saveReport(prisma, {
        examId: param(req, 'id'),
        stats: parsed as ReportStats,
        ...(req.file ? { docx: req.file.buffer } : {}),
      });

      // Багш имэйл илгээхийг хүсвэл `?send=1`
      if (req.query['send'] === '1') {
        const options = emailReportSchema.parse(req.body ?? {});
        const outcome = await sendReportEmail(prisma, report.id, options);
        res.status(201).json({ report, email: outcome });
        return;
      }

      res.status(201).json({ report });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/exams/:id/reports  [token]
  // -------------------------------------------------------------------------
  router.get(
    '/:id/reports',
    teacher,
    asyncHandler(async (req, res) => {
      const [reports, emailQueue] = await Promise.all([
        listReports(prisma, param(req, 'id')),
        listEmailQueue(prisma, param(req, 'id')),
      ]);
      res.json({ reports, emailQueue });
    }),
  );

  // -------------------------------------------------------------------------
  // GET /api/exams/:id/export.csv  [token]
  // -------------------------------------------------------------------------
  router.get(
    '/:id/export.csv',
    teacher,
    asyncHandler(async (req, res) => {
      const exam = await getExam(prisma, param(req, 'id'));
      const submissions = await listSubmissions(prisma, exam.id);
      const csv = submissionsToCsv(exam, submissions);

      const fileName = `${exam.id}-submissions.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csv);
    }),
  );

  return router;
}
