/**
 * `/api/reports/:id` — тайлан унших, татах, имэйлээр илгээх.
 */

import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { requireTeacherForReport } from '../middleware/teacherAuth';
import { attachUser } from '../middleware/auth';
import { param } from '../lib/http';
import { emailReportSchema } from '../schemas';
import { deleteReport, getReport, getReportDocx } from '../services/reportService';
import { sendReportEmail } from '../services/emailService';

export function reportsRouter(prisma: PrismaClient): Router {
  const router = Router();
  // Нэвтэрсэн хэрэглэгчийг тодорхойлно — эс бөгөөс зөвхөн `?t=` токен ажиллана
  router.use(attachUser(prisma));

  const teacher = requireTeacherForReport(prisma);

  // GET /api/reports/:id  [token]
  router.get(
    '/:id',
    teacher,
    asyncHandler(async (req, res) => {
      const report = await getReport(prisma, param(req, 'id'));
      res.json({ report });
    }),
  );

  // GET /api/reports/:id/download  [token]
  router.get(
    '/:id/download',
    teacher,
    asyncHandler(async (req, res) => {
      const { data, fileName } = await getReportDocx(prisma, param(req, 'id'));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', String(data.byteLength));
      res.send(data);
    }),
  );

  // POST /api/reports/:id/email  [token]
  router.post(
    '/:id/email',
    teacher,
    asyncHandler(async (req, res) => {
      const options = emailReportSchema.parse(req.body ?? {});
      const outcome = await sendReportEmail(prisma, param(req, 'id'), options);
      res.status(outcome.status === 'sent' ? 200 : 502).json({ email: outcome });
    }),
  );

  // DELETE /api/reports/:id  [token]
  router.delete(
    '/:id',
    teacher,
    asyncHandler(async (req, res) => {
      await deleteReport(prisma, param(req, 'id'));
      res.status(204).end();
    }),
  );

  return router;
}
