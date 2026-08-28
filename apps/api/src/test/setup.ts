/**
 * Тестийн өгөгдлийн санг бэлдэнэ (vitest `globalSetup`).
 *
 * Тусдаа SQLite файл ашиглана — `dev.db`-г хөндөхгүй.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const TEST_DATABASE_FILE = resolve(apiRoot, 'prisma/test.db');
export const TEST_DATABASE_URL = 'file:./test.db';

export function setup(): void {
  for (const suffix of ['', '-journal']) {
    const path = `${TEST_DATABASE_FILE}${suffix}`;
    if (existsSync(path)) rmSync(path, { force: true });
  }

  // pnpm нь хамаарлыг root руу hoist хийдэггүй тул prisma CLI-г
  // apps/api-ийн шийдэлтээр (resolution) олно.
  const require = createRequire(resolve(apiRoot, 'package.json'));
  const prismaCli = require.resolve('prisma/build/index.js');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DATABASE_PROVIDER: 'sqlite' },
    stdio: 'pipe',
  });
}

export function teardown(): void {
  for (const suffix of ['', '-journal']) {
    const path = `${TEST_DATABASE_FILE}${suffix}`;
    if (existsSync(path)) rmSync(path, { force: true });
  }
}
