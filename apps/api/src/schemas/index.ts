/**
 * Хүсэлтийн бүтцийн баталгаажуулалт (zod).
 * Клиентээс ирсэн бүх өгөгдөл эндүүр л ордог.
 */

import { z } from 'zod';

export const questionTypeSchema = z.enum(['single', 'multi', 'truefalse', 'short']);
export const examModeSchema = z.enum(['pre', 'post']);
export const examStatusSchema = z.enum(['draft', 'active', 'closed']);
export const deliveryModeSchema = z.enum(['online', 'lan', 'offlineQr']);
export const syncStatusSchema = z.enum(['pending', 'synced', 'conflict']);
export const submissionSourceSchema = z.enum(['online', 'lan', 'answerQr', 'manualCode']);

/** `AnswerValue = string | string[] | boolean | null` */
export const answerValueSchema = z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]);

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'ISO-8601 огноо байх ёстой');

// ---------------------------------------------------------------------------
// Асуулт
// ---------------------------------------------------------------------------

export const optionSchema = z.object({
  id: z.string().min(1).max(8),
  text: z.string().min(1).max(500),
});

export const questionInputSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    order: z.number().int().min(1).max(500),
    type: questionTypeSchema,
    text: z.string().min(1, 'Асуултын текст хоосон байж болохгүй').max(2000),
    options: z.array(optionSchema).min(2).max(6).optional(),
    correctOptionIds: z.array(z.string().min(1)).max(6).optional(),
    acceptedAnswers: z.array(z.string().min(1).max(200)).max(20).optional(),
    points: z
      .number()
      .positive('Оноо 0-ээс их байх ёстой')
      .max(100)
      .refine((value) => Math.round(value * 2) === value * 2, 'Оноо 0.5-ийн алхамтай байх ёстой'),
    topic: z.string().max(120).optional(),
  })
  .superRefine((question, ctx) => {
    const addIssue = (message: string, path: string) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
    };

    if (question.type === 'single' || question.type === 'multi') {
      if (!question.options || question.options.length < 2) {
        addIssue('2–6 сонголт шаардлагатай', 'options');
      }
      const ids = new Set((question.options ?? []).map((option) => option.id));
      if (ids.size !== (question.options ?? []).length) {
        addIssue('Сонголтын id давхардсан байна', 'options');
      }
      const correct = question.correctOptionIds ?? [];
      if (correct.length === 0) {
        addIssue('Дор хаяж нэг зөв хариулт заана уу', 'correctOptionIds');
      }
      if (question.type === 'single' && correct.length > 1) {
        addIssue('`single` төрөлд зөвхөн нэг зөв хариулт байна', 'correctOptionIds');
      }
      for (const id of correct) {
        if (!ids.has(id)) addIssue(`"${id}" гэсэн сонголт байхгүй байна`, 'correctOptionIds');
      }
    }

    if (question.type === 'truefalse') {
      const correct = question.correctOptionIds ?? [];
      if (correct.length !== 1 || (correct[0] !== 'A' && correct[0] !== 'B')) {
        addIssue(
          '`truefalse` төрөлд зөв хариулт нь "A" (Үнэн) эсвэл "B" (Худал)',
          'correctOptionIds',
        );
      }
    }

    if (question.type === 'short') {
      if (!question.acceptedAnswers || question.acceptedAnswers.length === 0) {
        addIssue('Дор хаяж нэг хүлээн зөвшөөрөх хариулт шаардлагатай', 'acceptedAnswers');
      }
    }
  });

// ---------------------------------------------------------------------------
// Шалгалт
// ---------------------------------------------------------------------------

export const createExamSchema = z.object({
  title: z.string().min(1, 'Гарчиг хоосон байж болохгүй').max(300),
  subject: z.string().min(1, 'Хичээлийн нэр шаардлагатай').max(200),
  teacherName: z.string().min(1, 'Багшийн нэр шаардлагатай').max(200),
  teacherEmail: z.string().email('Имэйл хаяг буруу байна').max(320),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD хэлбэртэй байна'),
  deliveryMode: deliveryModeSchema.default('online'),
  passThreshold: z.number().min(0).max(100).default(60),
  durationMin: z.number().int().min(1).max(300).optional(),
  shuffle: z.boolean().default(false),
  showAnswersToStudent: z.boolean().default(true),
  onePerPage: z.boolean().default(false),
  status: z.enum(['draft', 'active']).default('active'),
  questions: z.array(questionInputSchema).min(1, 'Дор хаяж нэг асуулт шаардлагатай').max(200),
});

export const updateExamSchema = createExamSchema.partial().extend({
  questions: z.array(questionInputSchema).min(1).max(200).optional(),
});

export const setModeSchema = z.object({
  mode: z.literal('post'),
});

// ---------------------------------------------------------------------------
// Илгээлт
// ---------------------------------------------------------------------------

export const submissionInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  mode: examModeSchema,
  lastName: z.string().min(1, 'Овог шаардлагатай').max(50),
  firstName: z.string().min(1, 'Нэр шаардлагатай').max(50),
  className: z.string().min(1, 'Анги/бүлэг шаардлагатай').max(50),
  /** Клиент тооцоолсон түлхүүр; сервер дахин тооцож баталгаажуулна. */
  studentKey: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  answers: z.array(z.object({ questionId: z.string().min(1), value: answerValueSchema })).max(500),
  startedAt: isoDateTime,
  submittedAt: isoDateTime,
  durationSec: z.number().int().min(0).max(86400),
  deviceId: z.string().min(1).max(64),
  source: submissionSourceSchema.default('online'),
});

export const mineQuerySchema = z.object({
  studentKey: z.string().regex(/^[0-9a-f]{64}$/, 'studentKey нь 64 тэмдэгт hex байна'),
  mode: examModeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const syncRecordSchema = z.object({
  /** Клиент дэх бичлэгийн id — хариултад буцаана */
  id: z.string().min(1).max(64),
  entity: z.literal('submission'),
  examId: z.string().min(1).max(64),
  payload: submissionInputSchema,
});

export const syncBatchSchema = z.object({
  deviceId: z.string().min(1).max(64).optional(),
  records: z.array(syncRecordSchema).min(1).max(100, 'Нэг багцад дээд тал нь 100 бичлэг'),
});

// ---------------------------------------------------------------------------
// Тайлан
// ---------------------------------------------------------------------------

export const reportStatsSchema = z
  .object({
    nPre: z.number().int().min(0),
    nPost: z.number().int().min(0),
    nPaired: z.number().int().min(0),
  })
  .passthrough();

export const emailReportSchema = z.object({
  to: z.string().email('Имэйл хаяг буруу байна').optional(),
  subject: z.string().max(300).optional(),
  message: z.string().max(5000).optional(),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
