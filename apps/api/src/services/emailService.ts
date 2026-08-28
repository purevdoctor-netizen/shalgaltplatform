/**
 * Имэйл илгээх — Nodemailer + SMTP.
 * Хавсралт: тайлангийн .docx. Бие: KPI хураангуй (текст + энгийн HTML).
 */

import type { PrismaClient } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Exam, ReportStats } from '@shalgalt/shared';
import { CATEGORY_LABELS_MN, effectSizeLabel } from '@shalgalt/shared';
import { env } from '../env';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { toEmailQueueItem, toReport } from '../lib/mappers';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER !== '' ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    // Mailpit/MailHog нь TLS-гүй тул dev дээр шалгуурыг сулруулна.
    ...(env.isProduction ? {} : { tls: { rejectUnauthorized: false } }),
  });
  return transporter;
}

/** SMTP огт тохируулаагүй (анхдагч dev утга хэвээр) эсэх. */
export function isSmtpConfigured(): boolean {
  const host = env.SMTP_HOST.trim();
  if (host === '') return false;
  // localhost:1025 нь Mailpit-ийн dev анхдагч — жинхэнэ тохиргоо биш
  const isDevDefault = /^(localhost|127\.0\.0\.1)$/i.test(host) && env.SMTP_PORT === 1025;
  return !isDevDefault || env.SMTP_USER !== '';
}

/**
 * Nodemailer-ийн техникийн алдааг багшид ойлгомжтой монгол зөвлөмж болгоно.
 *
 * `connect ECONNREFUSED 127.0.0.1:1025` гэдэг мессеж багшид юу ч хэлэхгүй —
 * оронд нь юу хийхийг нь шууд зааж өгнө.
 */
export function describeSmtpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code ?? '';
  const target = `${env.SMTP_HOST}:${env.SMTP_PORT}`;

  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(raw)) {
    if (!isSmtpConfigured()) {
      return (
        'Имэйл сервер (SMTP) тохируулаагүй байна. ' +
        'Админ `.env` файлд SMTP_HOST / SMTP_USER / SMTP_PASS-ыг бөглөх шаардлагатай. ' +
        'Тайланг одоохондоо "Word (.docx) татах" товчоор татаж авч болно.'
      );
    }
    return `Имэйл сервер (${target}) хариу өгөхгүй байна. Хаяг, порт зөв эсэхийг шалгана уу.`;
  }

  if (code === 'ETIMEDOUT' || /ETIMEDOUT|timeout/i.test(raw)) {
    return `Имэйл сервер (${target}) руу холбогдох хугацаа хэтэрлээ. Интернэт холболт эсвэл галт хана хаасан байж магадгүй.`;
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /ENOTFOUND|getaddrinfo/i.test(raw)) {
    return `Имэйл серверийн хаяг "${env.SMTP_HOST}" олдсонгүй. SMTP_HOST зөв бичигдсэн эсэхийг шалгана уу.`;
  }

  if (code === 'EAUTH' || /535|Username and Password not accepted|Invalid login/i.test(raw)) {
    return (
      'Имэйлийн нэвтрэлт амжилтгүй. Gmail ашиглаж байвал энгийн нууц үг БИШ, ' +
      '"App Password" (програмын нууц үг) хэрэгтэй. SMTP_USER / SMTP_PASS-ыг шалгана уу.'
    );
  }

  if (code === 'ESOCKET' || /wrong version number|SSL routines|self.signed/i.test(raw)) {
    return (
      `Имэйл серверийн шифрлэлт тохирохгүй байна. 465 порт бол SMTP_SECURE=true, ` +
      `587 порт бол SMTP_SECURE=false байх ёстой (одоо: порт ${env.SMTP_PORT}, secure=${env.SMTP_SECURE}).`
    );
  }

  if (code === 'EENVELOPE' || /EENVELOPE|no recipients/i.test(raw)) {
    return 'Хүлээн авагчийн эсвэл илгээгчийн имэйл хаяг буруу байна (SMTP_FROM-ыг шалгана уу).';
  }

  return `Имэйл илгээхэд алдаа гарлаа: ${raw}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fmt(value: number | null | undefined, suffix = '', digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Имэйлийн агуулга
// ---------------------------------------------------------------------------

export function buildEmailSubject(exam: Exam): string {
  return `[${exam.subject}] ${exam.title} — өмнөх/дараах үнэлгээний тайлан`;
}

export function buildEmailText(exam: Exam, stats: ReportStats): string {
  const lines = [
    `${exam.title}`,
    `Хичээл: ${exam.subject}`,
    `Багш: ${exam.teacherName}`,
    `Огноо: ${exam.examDate}`,
    '',
    '── ГОЛ ҮЗҮҮЛЭЛТ ─────────────────────────',
    `Оролцоо           : ӨМНӨХ ${stats.nPre} · ДАРААХ ${stats.nPost} · хосолсон ${stats.nPaired}`,
    `Дундаж дүн        : ${fmt(stats.pre?.mean, '%')} → ${fmt(stats.post?.mean, '%')}`,
    `Дундаж ахиц       : ${fmt(stats.meanAbsGain, ' нэгж')}`,
    `Hake <g>          : ${fmt(stats.hakeGain, '', 3)}`,
    `Тэнцсэн хувь      : ${fmt(stats.pre?.passRate, '%')} → ${fmt(stats.post?.passRate, '%')}`,
    `Cohen's d         : ${fmt(stats.cohenD)}${
      stats.cohenD !== null ? ` (${effectSizeLabel(stats.cohenD)} үр нөлөө)` : ''
    }`,
    `p-утга            : ${stats.pValue === null ? '—' : stats.pValue.toFixed(4)}`,
    '',
    '── АНГИЛАЛ ──────────────────────────────',
    ...Object.entries(stats.categoryCounts).map(
      ([key, count]) =>
        `${CATEGORY_LABELS_MN[key as keyof typeof CATEGORY_LABELS_MN].padEnd(16, ' ')}: ${count}`,
    ),
    '',
    '── ДҮГНЭЛТ ──────────────────────────────',
    stats.conclusions.overall,
    '',
    stats.conclusions.bestTopic,
    stats.conclusions.weakTopic,
    '',
    'Зөвлөмж:',
    ...stats.conclusions.recommendations.map((item, index) => `  ${index + 1}. ${item}`),
    '',
    'Дэлгэрэнгүйг хавсаргасан Word тайлангаас үзнэ үү.',
  ];

  if (stats.lowSampleWarning) {
    lines.push('', '⚠ Түүвэр бага тул статистик найдвартай биш болохыг анхаарна уу.');
  }
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildEmailHtml(exam: Exam, stats: ReportStats): string {
  const kpi: [string, string][] = [
    ['Оролцоо', `ӨМНӨХ ${stats.nPre} · ДАРААХ ${stats.nPost} · хосолсон ${stats.nPaired}`],
    ['Дундаж дүн', `${fmt(stats.pre?.mean, '%')} → ${fmt(stats.post?.mean, '%')}`],
    ['Дундаж ахиц', fmt(stats.meanAbsGain, ' нэгж')],
    ['Hake &lt;g&gt;', fmt(stats.hakeGain, '', 3)],
    ['Тэнцсэн хувь', `${fmt(stats.pre?.passRate, '%')} → ${fmt(stats.post?.passRate, '%')}`],
    [
      "Cohen's d",
      `${fmt(stats.cohenD)}${stats.cohenD !== null ? ` (${effectSizeLabel(stats.cohenD)})` : ''}`,
    ],
    ['p-утга', stats.pValue === null ? '—' : stats.pValue.toFixed(4)],
  ];

  return `<!doctype html>
<html lang="mn"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(90deg,#4f46e5,#2563eb);padding:24px;color:#ffffff">
      <div style="font-size:20px;font-weight:bold">${escapeHtml(exam.title)}</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px">
        ${escapeHtml(exam.subject)} · ${escapeHtml(exam.teacherName)} · ${escapeHtml(exam.examDate)}
      </div>
    </div>
    <div style="padding:24px">
      <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
        ${kpi
          .map(
            ([label, value], index) => `<tr style="background:${index % 2 ? '#ffffff' : '#f9fafb'}">
          <td style="color:#6b7280;width:45%">${label}</td>
          <td style="font-weight:bold">${value}</td></tr>`,
          )
          .join('')}
      </table>

      <h3 style="font-size:15px;margin:24px 0 8px">Дүгнэлт</h3>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px">${escapeHtml(stats.conclusions.overall)}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 4px">${escapeHtml(stats.conclusions.bestTopic)}</p>
      <p style="font-size:14px;line-height:1.6;margin:0">${escapeHtml(stats.conclusions.weakTopic)}</p>

      <h3 style="font-size:15px;margin:24px 0 8px">Зөвлөмж</h3>
      <ol style="font-size:14px;line-height:1.6;padding-left:20px;margin:0">
        ${stats.conclusions.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ol>

      ${
        stats.lowSampleWarning
          ? `<p style="margin-top:20px;padding:12px;background:#fffbeb;border-left:4px solid #f59e0b;font-size:13px">
              ⚠ Түүвэр бага тул статистик найдвартай биш болохыг анхаарна уу.
             </p>`
          : ''
      }

      <p style="margin-top:24px;font-size:13px;color:#6b7280">
        Дэлгэрэнгүй график, хүснэгт бүхий тайланг хавсаргасан Word файлаас үзнэ үү.
      </p>
    </div>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Илгээх
// ---------------------------------------------------------------------------

export interface SendReportOptions {
  to?: string;
  subject?: string;
  message?: string;
}

/**
 * Тайланг имэйлээр илгээнэ.
 *
 * ⚠ Аюулгүй байдал: хүлээн авагчийг ЗӨВХӨН шалгалтын `teacherEmail`-ээр
 * тогтооно. Дурын хаяг руу илгээх боломжгүй (даалгаврын шаардлага).
 */
export async function sendReportEmail(
  prisma: PrismaClient,
  reportId: string,
  options: SendReportOptions = {},
): Promise<{ status: 'sent' | 'failed'; to: string; error?: string }> {
  const row = await prisma.report.findUnique({
    where: { id: reportId },
    include: { exam: { include: { questions: true } } },
  });
  if (!row) throw ApiError.notFound('Ийм тайлан олдсонгүй.');

  const to = row.exam.teacherEmail;
  if (options.to && options.to !== to) {
    throw ApiError.badRequest('Тайланг зөвхөн шалгалтад бүртгэгдсэн багшийн имэйл рүү илгээнэ.');
  }

  const report = toReport(row);
  const exam = {
    title: row.exam.title,
    subject: row.exam.subject,
    teacherName: row.exam.teacherName,
    examDate: row.exam.examDate,
  } as Exam;

  const queueId = newId('eq');
  await prisma.emailQueueItem.upsert({
    where: { id: queueId },
    create: {
      id: queueId,
      reportId,
      examId: row.examId,
      to,
      createdAt: nowIso(),
      attempts: 0,
      status: 'pending',
    },
    update: {},
  });

  // Хавсралтыг ӨГӨГДЛИЙН САНГААС авна (диск түр зуурын байж болно)
  const attachments: { filename: string; content: Buffer }[] = [];
  if (row.docxData) {
    const safeTitle = row.exam.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    attachments.push({
      filename: `${safeTitle}-тайлан.docx`,
      content: Buffer.from(row.docxData),
    });
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject: options.subject ?? buildEmailSubject(exam),
      text: `${options.message ? `${options.message}\n\n` : ''}${buildEmailText(exam, report.stats)}`,
      html: buildEmailHtml(exam, report.stats),
      attachments,
    });

    const sentAt = nowIso();
    await prisma.$transaction([
      prisma.report.update({
        where: { id: reportId },
        data: { emailStatus: 'sent', emailSentAt: sentAt, emailError: null },
      }),
      prisma.emailQueueItem.update({
        where: { id: queueId },
        data: { status: 'sent', attempts: { increment: 1 }, lastError: null },
      }),
    ]);

    return { status: 'sent', to };
  } catch (error) {
    // Техникийн алдааг багшид ойлгомжтой зөвлөмж болгоно
    const message = describeSmtpError(error);
    console.error('[email] Илгээх алдаа:', error);
    await prisma.$transaction([
      prisma.report.update({
        where: { id: reportId },
        data: { emailStatus: 'failed', emailError: message },
      }),
      prisma.emailQueueItem.update({
        where: { id: queueId },
        data: { status: 'failed', attempts: { increment: 1 }, lastError: message },
      }),
    ]);

    return { status: 'failed', to, error: message };
  }
}

/** Багшийн самбарт харуулах имэйлийн дараалал. */
export async function listEmailQueue(prisma: PrismaClient, examId: string) {
  const rows = await prisma.emailQueueItem.findMany({
    where: { examId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toEmailQueueItem);
}

export interface SmtpStatus {
  ok: boolean;
  configured: boolean;
  message: string;
  /** Нууц үггүй тохиргооны хураангуй — админд харуулна. */
  settings: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
  };
}

/** SMTP тохиргоо ажиллаж байгаа эсэхийг шалгана (админы самбарт). */
export async function verifySmtp(): Promise<SmtpStatus> {
  const settings = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    from: env.SMTP_FROM,
  };
  const configured = isSmtpConfigured();

  if (!configured) {
    return {
      ok: false,
      configured: false,
      message:
        'SMTP тохируулаагүй байна. `.env` файлд SMTP_HOST, SMTP_USER, SMTP_PASS-ыг бөглөнө үү. ' +
        'Тохируулаагүй үед тайланг зөвхөн гараар татаж авна.',
      settings,
    };
  }

  try {
    await getTransporter().verify();
    return {
      ok: true,
      configured: true,
      message: `Холболт амжилттай: ${env.SMTP_HOST}:${env.SMTP_PORT}`,
      settings,
    };
  } catch (error) {
    return { ok: false, configured: true, message: describeSmtpError(error), settings };
  }
}

/** Тохиргоог шалгахын тулд өөрт нь туршилтын захиа илгээнэ. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; message: string }> {
  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Шалгалтын платформ — туршилтын захиа',
      text:
        'Энэ бол туршилтын захиа.\n\n' +
        'Та үүнийг хүлээж авсан бол имэйлийн тохиргоо зөв ажиллаж байна.\n' +
        `Сервер: ${env.SMTP_HOST}:${env.SMTP_PORT}\n`,
    });
    return { ok: true, message: `Туршилтын захиа ${to} руу илгээгдлээ.` };
  } catch (error) {
    return { ok: false, message: describeSmtpError(error) };
  }
}

/** Тохиргоо солигдсон үед transporter-ыг дахин үүсгэнэ. */
export function resetTransporter(): void {
  transporter = null;
}
