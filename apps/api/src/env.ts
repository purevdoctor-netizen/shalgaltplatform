/**
 * Орчны хувьсагчийг ачаалж, zod-оор баталгаажуулна.
 * Ганц эх сурвалж — монорепогийн үндэс дээрх `.env` (ASSUMPTIONS A-10).
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));

/** `apps/api/src` → монорепогийн үндэс. dist-ээс ажиллах үед нэг шат богино. */
function findRepoRoot(): string {
  let current = here;
  for (let depth = 0; depth < 6; depth++) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(here, '../../..');
}

const repoRoot = findRepoRoot();
const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  /**
   * Ажиллах горим.
   *
   * ⚠ Vite нь `.env` файлд `NODE_ENV=production` байхыг ЗӨВШӨӨРДӨГГҮЙ
   * (build үед алдаа өгнө). Тиймээс `.env`-д `APP_ENV` бичиж, `NODE_ENV`-ыг
   * зөвхөн процессын орчноор дамжуулна. Хоёулаа байвал `APP_ENV` давамгайлна.
   */
  APP_ENV: z.enum(['development', 'test', 'production']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Үүлэн платформууд (Render, Koyeb, Railway…) сонсох портыг `PORT`-оор
   * дамжуулдаг. Байвал `API_PORT`-оос давамгайлна.
   */
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),

  LAN_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LAN_DATABASE_URL: z.string().default('file:./lan.db'),
  UPSTREAM_API_URL: z.string().default(''),

  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ALLOW_LAN: booleanish,

  /**
   * `?t=<teacherToken>` хуваалцах линкийг хаана. `true` бол зөвхөн нэвтэрсэн
   * эзэмшигч/админ шалгалтаа удирдана.
   */
  DISABLE_SHARE_TOKEN: booleanish,

  /**
   * Хэрэглэгч өөрөө бүртгүүлэхийг зөвшөөрөх эсэх. Анхдагчаар ХААЛТТАЙ —
   * зөвхөн админ данс нээж өгнө.
   */
  ALLOW_SELF_SIGNUP: booleanish,

  RATE_LIMIT_WINDOW_MIN: z.coerce.number().positive().default(1),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  /**
   * Вэб апп-ын build хавтас (`apps/web/dist`). Тохируулбал API нь PWA-г ижил
   * портоор үйлчилнэ — LAN/дотоод сүлжээнд nginx, Docker шаардлагагүй болно.
   * Хоосон бол зөвхөн API ажиллана.
   */
  SERVE_WEB_DIR: z.string().default(''),

  /**
   * Эхний админ дансыг автоматаар үүсгэх (үүлэн орчинд CLI ажиллуулах
   * боломжгүй тул). Зөвхөн систем дээр админ ОГТ байхгүй үед ажиллана.
   * Данс үүссэний дараа эдгээр хувьсагчийг устгахыг зөвлөнө.
   */
  BOOTSTRAP_ADMIN_USERNAME: z.string().default(''),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default(''),
  BOOTSTRAP_ADMIN_NAME: z.string().default('Админ'),

  /**
   * Данс аль хэдийн байсан ч нууц үгийг нь дарж бичнэ.
   *
   * Админ нууц үгээ мартвал үүлэн орчинд сэргээх өөр арга байхгүй
   * (CLI ажиллуулах боломжгүй). Сэргээсний дараа энэ хувьсагчийг
   * ЗААВАЛ устгана — эс бөгөөс сервер дахин асаах бүрд нууц үг буцаж
   * тохируулагдана.
   */
  BOOTSTRAP_ADMIN_RESET: booleanish,

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanish,
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Шалгалтын платформ <noreply@shalgalt.local>'),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Орчны хувьсагчийн алдаа:');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

/** `APP_ENV` (.env) → `NODE_ENV` (процесс) → `development` */
const mode = parsed.data.APP_ENV ?? parsed.data.NODE_ENV;

export const env = {
  ...parsed.data,
  NODE_ENV: mode,
  /** Бодит сонсох порт: `PORT` (үүлэн) → `API_PORT` (өөрийн сервер) */
  API_PORT: parsed.data.PORT ?? parsed.data.API_PORT,
  repoRoot,
  /** Таслалаар зааглагдсан origin жагсаалт */
  webOrigins: parsed.data.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
  uploadDir: resolve(repoRoot, 'apps/api', parsed.data.UPLOAD_DIR),
  maxUploadBytes: Math.round(parsed.data.MAX_UPLOAD_MB * 1024 * 1024),
  /** Вэб build хавтасны бүрэн зам, эсвэл `null` (зөвхөн API). */
  webDir: parsed.data.SERVE_WEB_DIR === '' ? null : resolve(repoRoot, parsed.data.SERVE_WEB_DIR),
  isProduction: mode === 'production',
  isTest: mode === 'test',
} as const;

export type Env = typeof env;
