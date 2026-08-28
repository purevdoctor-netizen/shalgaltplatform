/**
 * Prisma CLI-ийн боодол.
 *
 * Учир нь:
 *   1. Prisma CLI нь `.env`-ыг зөвхөн өөрийн хавтас/төслийн үндэснээс хайдаг
 *      боловч бидний ГАНЦ `.env` монорепогийн үндэс дээр байна (ASSUMPTIONS A-10).
 *   2. `datasource.provider` нь env() хүлээж авдаггүй тул урьдчилан солих
 *      шаардлагатай (`set-provider.mjs`).
 *
 * Хэрэглээ: `node prisma/cli.mjs migrate dev --name init`
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');
const repoRoot = resolve(apiRoot, '../..');

const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn(`[prisma] "${envPath}" олдсонгүй — .env.example-ээс хуулна уу.`);
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}
if (!process.env.DATABASE_PROVIDER) {
  process.env.DATABASE_PROVIDER = 'sqlite';
}

// 1. provider-ыг DATABASE_PROVIDER-т тааруулна
const setProvider = spawnSync(process.execPath, [resolve(here, 'set-provider.mjs')], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: process.env,
});
if (setProvider.status !== 0) process.exit(setProvider.status ?? 1);

// 2. Prisma CLI-г дуудна
const require = createRequire(resolve(apiRoot, 'package.json'));
const prismaCli = require.resolve('prisma/build/index.js');

const args = process.argv.slice(2);

const isGenerate = args[0] === 'generate';

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: apiRoot,
  // `generate` үед гаралтыг барьж авч EPERM эсэхийг шалгана
  stdio: isGenerate ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  env: process.env,
  encoding: 'utf8',
});

/**
 * Windows дээр `prisma generate` нь query engine-ийн .dll файлыг солих гэж
 * оролдоод, өөр процесс (эсвэл вирусын эсрэг програм) түүнийг түгжсэн бол
 * EPERM алдаа өгдөг.
 *
 * Ийм үед үүсгэсэн клиент аль хэдийн байгаа бөгөөд schema-гаас ШИНЭ бол
 * үнэн хэрэгтээ юу ч дутуугүй — build-ыг зогсоох шаардлагагүй.
 * (Linux/үүлэн орчинд энэ асуудал огт гардаггүй.)
 */
function generatedClientIsCurrent() {
  const schemaPath = resolve(here, 'schema.prisma');

  // `.prisma/client` нь `@prisma/client`-ийн хажууд байрладаг
  const candidates = [];
  try {
    const pkg = require.resolve('@prisma/client/package.json');
    candidates.push(resolve(dirname(pkg), '..', '..', '.prisma', 'client', 'index.d.ts'));
    candidates.push(resolve(dirname(pkg), '..', '.prisma', 'client', 'index.d.ts'));
  } catch {
    // @prisma/client шийдэгдэхгүй бол доорх нөөц замыг үзнэ
  }
  candidates.push(
    resolve(apiRoot, '..', '..', 'node_modules', '.prisma', 'client', 'index.d.ts'),
  );

  for (const candidate of candidates) {
    try {
      const clientStat = statSync(candidate);
      const schemaStat = statSync(schemaPath);
      if (clientStat.mtimeMs >= schemaStat.mtimeMs) return true;
    } catch {
      // дараагийн замыг үзнэ
    }
  }
  return false;
}

if (isGenerate) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status !== 0 && /EPERM|EBUSY/.test(output) && generatedClientIsCurrent()) {
    console.warn('');
    console.warn('[prisma] ⚠ Engine файлыг солиж чадсангүй (өөр процесс түгжсэн байна).');
    console.warn('[prisma]   Үүсгэсэн клиент schema-тайгаа тохирч байгаа тул үргэлжлүүлнэ.');
    console.warn('[prisma]   Бүрэн засах: компьютероо дахин асаана уу.');
    console.warn('');
    process.exit(0);
  }

  // Бусад тохиолдолд Prisma-гийн гаралтыг хэвээр нь харуулна
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

process.exit(result.status ?? 1);
