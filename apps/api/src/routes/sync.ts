/**
 * `POST /api/sync` — офлайн хуримтлагдсан бичлэгийн багц синк.
 */

import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { bulkRateLimiter } from '../middleware/rateLimit';
import { syncBatchSchema } from '../schemas';
import { processSyncBatch } from '../services/syncService';

export function syncRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post(
    '/',
    bulkRateLimiter,
    asyncHandler(async (req, res) => {
      const batch = syncBatchSchema.parse(req.body);
      const result = await processSyncBatch(prisma, batch);
      res.json(result);
    }),
  );

  return router;
}
