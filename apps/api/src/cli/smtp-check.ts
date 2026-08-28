/**
 * Имэйлийн тохиргоог шалгах CLI.
 *
 *   pnpm --filter @shalgalt/api email:check                 # зөвхөн холболт шалгана
 *   pnpm --filter @shalgalt/api email:check -- bagsh@x.mn   # туршилтын захиа илгээнэ
 */

import { env } from '../env';
import { sendTestEmail, verifySmtp } from '../services/emailService';

async function main(): Promise<void> {
  const to = process.argv[2];

  console.info('');
  console.info('  Имэйлийн тохиргоо');
  console.info(`    SMTP_HOST   : ${env.SMTP_HOST}`);
  console.info(`    SMTP_PORT   : ${env.SMTP_PORT}`);
  console.info(`    SMTP_SECURE : ${env.SMTP_SECURE}`);
  console.info(`    SMTP_USER   : ${env.SMTP_USER || '(хоосон)'}`);
  console.info(`    SMTP_PASS   : ${env.SMTP_PASS ? '•'.repeat(8) : '(хоосон)'}`);
  console.info(`    SMTP_FROM   : ${env.SMTP_FROM}`);
  console.info('');

  const status = await verifySmtp();
  console.info(`  ${status.ok ? '✔' : '✖'} ${status.message}`);
  console.info('');

  if (!status.ok) process.exit(1);

  if (to) {
    const result = await sendTestEmail(to);
    console.info(`  ${result.ok ? '✔' : '✖'} ${result.message}`);
    console.info('');
    process.exit(result.ok ? 0 : 1);
  }

  console.info('  Туршилтын захиа илгээх бол:');
  console.info('    pnpm --filter @shalgalt/api email:check -- таны@имэйл.com');
  console.info('');
}

main().catch((error: unknown) => {
  console.error('✖ Алдаа:', error instanceof Error ? error.message : error);
  process.exit(1);
});
