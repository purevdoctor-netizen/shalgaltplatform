/**
 * `schema.prisma`-ийн datasource provider-ыг `DATABASE_PROVIDER` орчны
 * хувьсагчид тааруулна.
 *
 * Prisma нь `provider = env(...)`-ыг ЗӨВШӨӨРДӨГГҮЙ (validate алдаа өгнө), тиймээс
 * prisma команд ажиллахын өмнө энэ скрипт мөрийг солино.
 *
 * Хэрэглээ: `node prisma/set-provider.mjs`  (package.json-ы pre* script-ээс)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED = ['sqlite', 'postgresql'];

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, 'schema.prisma');

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim();

if (!SUPPORTED.includes(provider)) {
  console.error(
    `[prisma] DATABASE_PROVIDER="${provider}" дэмжигдэхгүй. Боломжит утга: ${SUPPORTED.join(', ')}`,
  );
  process.exit(1);
}

const source = readFileSync(schemaPath, 'utf8');
const pattern = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")([^"]+)(")/s;
const match = source.match(pattern);

if (!match) {
  console.error('[prisma] schema.prisma доторх datasource provider мөрийг олсонгүй.');
  process.exit(1);
}

if (match[2] === provider) {
  console.info(`[prisma] provider аль хэдийн "${provider}" байна.`);
  process.exit(0);
}

writeFileSync(schemaPath, source.replace(pattern, `$1${provider}$3`), 'utf8');
console.info(`[prisma] provider "${match[2]}" → "${provider}" болголоо.`);
