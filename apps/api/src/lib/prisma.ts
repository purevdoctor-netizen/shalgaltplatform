/**
 * Prisma клиентийн ганц хувилбар (singleton).
 * `tsx watch` дахин ачаалахад холболт хуримтлагдахаас сэргийлнэ.
 */

import { PrismaClient } from '@prisma/client';
import { env } from '../env';

const globalForPrisma = globalThis as unknown as { __shalgaltPrisma?: PrismaClient };

function createClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    log: env.isProduction ? ['error'] : ['warn', 'error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });
}

export const prisma: PrismaClient = globalForPrisma.__shalgaltPrisma ?? createClient();

if (!env.isProduction) {
  globalForPrisma.__shalgaltPrisma = prisma;
}

/** LAN сервер өөр өгөгдлийн сан ашигладаг тул тусдаа клиент үүсгэнэ. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return createClient(databaseUrl);
}
