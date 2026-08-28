/**
 * Тайлангийн бизнес логик.
 *
 * ⚠ Сервер .docx-ыг ҮҮСГЭХГҮЙ — клиент (браузер) үүсгээд байршуулна.
 * Сервер зөвхөн хадгалж, имэйлээр илгээх үүрэгтэй.
 *
 * ⚠ Файлыг ДИСК дээр биш ӨГӨГДЛИЙН САНД хадгална. Учир нь үүлэн платформууд
 * (Render, Koyeb г.м.) дискийг түр зуур болгодог тул дахин асахад файл
 * алга болно. Мөн нөөцлөлт хийхэд сан ганцаараа хангалттай болно.
 */

import type { PrismaClient } from '@prisma/client';
import type { Report, ReportStats } from '@shalgalt/shared';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { toReport } from '../lib/mappers';

function nowIso(): string {
  return new Date().toISOString();
}

/** Татахад ашиглах файлын нэр (замын халдлагаас цэвэрлэсэн). */
function safeFileName(reportId: string): string {
  return `${reportId.replace(/[^a-zA-Z0-9_-]/g, '')}.docx`;
}

export interface SaveReportInput {
  examId: string;
  stats: ReportStats;
  docx?: Buffer;
}

/** Клиентээс ирсэн тайлан + .docx-ыг хадгална. */
export async function saveReport(prisma: PrismaClient, input: SaveReportInput): Promise<Report> {
  const id = newId('rep');

  const row = await prisma.report.create({
    data: {
      id,
      examId: input.examId,
      generatedAt: nowIso(),
      statsJson: JSON.stringify(input.stats),
      docxFileName: input.docx ? safeFileName(id) : null,
      docxSize: input.docx ? input.docx.byteLength : null,
      docxData: input.docx ?? null,
      emailStatus: 'pending',
    },
  });

  return toReport(row);
}

export async function getReport(prisma: PrismaClient, reportId: string): Promise<Report> {
  const row = await prisma.report.findUnique({ where: { id: reportId } });
  if (!row) throw ApiError.notFound('Ийм тайлан олдсонгүй.');
  return toReport(row);
}

export async function listReports(prisma: PrismaClient, examId: string): Promise<Report[]> {
  // Жагсаалтад файлын агуулга хэрэггүй — санах ойг дэмий эзлэхгүйн тулд
  // `docxData`-г ЗОРИУД сонгохгүй.
  const rows = await prisma.report.findMany({
    where: { examId },
    orderBy: { generatedAt: 'desc' },
    select: {
      id: true,
      examId: true,
      generatedAt: true,
      statsJson: true,
      docxFileName: true,
      docxSize: true,
      emailStatus: true,
      emailError: true,
      emailSentAt: true,
    },
  });
  return rows.map((row) => toReport({ ...row, docxData: null }));
}

/** Тайлангийн .docx агуулга (татах, имэйлд хавсаргах). */
export async function getReportDocx(
  prisma: PrismaClient,
  reportId: string,
): Promise<{ data: Buffer; fileName: string }> {
  const row = await prisma.report.findUnique({
    where: { id: reportId },
    select: { docxData: true, docxFileName: true },
  });

  if (!row) throw ApiError.notFound('Ийм тайлан олдсонгүй.');
  if (!row.docxData || !row.docxFileName) {
    throw ApiError.notFound('Энэ тайланд .docx файл хавсрагдаагүй байна.');
  }

  return { data: Buffer.from(row.docxData), fileName: row.docxFileName };
}

/** Тайлан устгах. */
export async function deleteReport(prisma: PrismaClient, reportId: string): Promise<void> {
  const row = await prisma.report.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!row) throw ApiError.notFound('Ийм тайлан олдсонгүй.');
  await prisma.report.delete({ where: { id: reportId } });
}
