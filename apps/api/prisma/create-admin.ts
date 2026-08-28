/**
 * Эхний админ данс үүсгэх / нууц үг сэргээх.
 *
 *   pnpm admin:create                          # интерактив (нэр, нууц үг асууна)
 *   pnpm admin:create -- --username admin --name "Б.Пүрэвдорж"
 *   pnpm admin:create -- --username admin --password "нууцүг123"
 *   pnpm admin:create -- --username admin --reset
 *
 * Нууц үг зааж өгөөгүй бол систем санамсаргүй түр нууц үг үүсгэж НЭГ УДАА
 * дэлгэц дээр хэвлэнэ.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/env';
import {
  createUser,
  normalizeUsername,
  resetPassword,
  validatePasswordStrength,
} from '../src/services/authService';

const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

interface Options {
  username?: string;
  name?: string;
  email?: string;
  password?: string;
  reset: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { reset: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--username' && argv[i + 1]) options.username = argv[++i];
    else if (flag === '--name' && argv[i + 1]) options.name = argv[++i];
    else if (flag === '--email' && argv[i + 1]) options.email = argv[++i];
    else if (flag === '--password' && argv[i + 1]) options.password = argv[++i];
    else if (flag === '--reset') options.reset = true;
  }
  return options;
}

function banner(title: string): void {
  console.info('');
  console.info('='.repeat(58));
  console.info(`  ${title}`);
  console.info('='.repeat(58));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const interactive = stdin.isTTY === true;

  let username = options.username;
  let fullName = options.name;

  if ((!username || !fullName) && interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (!username) username = (await rl.question('Нэвтрэх нэр (жишээ: admin): ')).trim();
      if (!fullName) fullName = (await rl.question('Овог нэр: ')).trim();
      if (!options.email) {
        const email = (await rl.question('Имэйл (заавал биш): ')).trim();
        if (email !== '') options.email = email;
      }
    } finally {
      rl.close();
    }
  }

  if (!username) {
    console.error('✖ `--username` шаардлагатай (эсвэл интерактив горимд ажиллуулна уу).');
    process.exit(1);
  }
  username = normalizeUsername(username);

  if (options.password) {
    const problem = validatePasswordStrength(options.password);
    if (problem) {
      console.error(`✖ ${problem}`);
      process.exit(1);
    }
  }

  const existing = await prisma.user.findUnique({ where: { username } });

  // -------------------------------------------------------------------------
  // Байгаа данс — нууц үг сэргээх
  // -------------------------------------------------------------------------
  if (existing) {
    if (!options.reset) {
      console.error(`✖ "${username}" нэртэй хэрэглэгч аль хэдийн байна.`);
      console.error('  Нууц үгийг нь сэргээх бол `--reset` тугийг нэмнэ үү.');
      process.exit(1);
    }

    const password = await resetPassword(prisma, existing.id, options.password);

    // Идэвхгүй бол сэргээж, админ болгоно
    if (!existing.isActive || existing.role !== 'admin') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true, role: 'admin', updatedAt: new Date().toISOString() },
      });
    }

    banner('НУУЦ ҮГ СЭРГЭЭГДЛЭЭ');
    console.info(`  Нэвтрэх нэр : ${username}`);
    console.info(`  Нууц үг     : ${password}`);
    console.info('');
    console.info('  ⚠ Энэ нууц үгийг дахин харах БОЛОМЖГҮЙ. Одоо хуулж аваарай.');
    console.info('  Эхний нэвтрэлтэд шинэ нууц үг заавал солиулна.');
    console.info('');
    return;
  }

  // -------------------------------------------------------------------------
  // Шинэ админ
  // -------------------------------------------------------------------------
  if (!fullName || fullName === '') fullName = username;

  const result = await createUser(prisma, {
    username,
    fullName,
    role: 'admin',
    ...(options.email ? { email: options.email } : {}),
    ...(options.password ? { password: options.password } : {}),
  });

  banner('АДМИН ДАНС ҮҮСЛЭЭ');
  console.info(`  Нэвтрэх нэр : ${result.user.username}`);
  console.info(`  Овог нэр    : ${result.user.fullName}`);
  if (result.user.email) console.info(`  Имэйл       : ${result.user.email}`);
  console.info(`  Нууц үг     : ${result.tempPassword}`);
  console.info('');
  console.info('  ⚠ Энэ нууц үгийг дахин харах БОЛОМЖГҮЙ. Одоо хуулж аваарай.');
  console.info('  Эхний нэвтрэлтэд шинэ нууц үг заавал солиулна.');
  console.info('');
  console.info('  Дараа нь энэ дансаар нэвтэрч, багш нарын данс нээж өгнө үү:');
  console.info('    /admin/users');
  console.info('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error('✖ Алдаа:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
