/**
 * Хурдны хязгаарлалт — 60 хүсэлт / мин / IP (тохируулж болно).
 */

import rateLimit from 'express-rate-limit';
import { env } from '../env';

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Тест үед хязгаарлалт саад болохгүй
  skip: () => env.isTest,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Хэт олон хүсэлт илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.',
    },
  },
});

/**
 * Sync ба илгээлт нь багц үйлдэл тул илүү өгөөмөр хязгаартай.
 * (30 сурагч зэрэг илгээх нөхцөлд 60/мин хүрэлцэхгүй.)
 */
export const bulkRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  limit: env.RATE_LIMIT_MAX * 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Хэт олон хүсэлт илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.',
    },
  },
});
