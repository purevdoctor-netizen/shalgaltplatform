/**
 * API клиент — timeout, нэгдсэн алдаа боловсруулалттай `fetch` боодол.
 */

import type {
  EmailQueueItem,
  Exam,
  ExamMode,
  Report,
  ReportStats,
  Submission,
  User,
  UserRole,
} from '@shalgalt/shared';
import { config } from '../config';

/** Багшийн шалгалтын жагсаалтын мөр (`GET /api/exams`). */
export interface ExamListItem {
  id: string;
  title: string;
  subject: string;
  examDate: string;
  mode: ExamMode;
  status: 'draft' | 'active' | 'closed';
  deliveryMode: 'online' | 'lan' | 'offlineQr';
  teacherName: string;
  teacherToken: string;
  ownerId: string | null;
  createdAt: string;
  questionCount: number;
  submissionCount: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }

  get isOffline(): boolean {
    return this.status === 0;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * Хуваалцах токен — `?t=` query болж нэмэгдэнэ.
   * Нэвтэрсэн эзэмшигч/админд шаардлагагүй (сесс cookie хангалттай).
   */
  token?: string | null;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** FormData илгээх үед JSON толгой тавихгүй. */
  formData?: FormData;
  timeoutMs?: number;
}

function buildUrl(path: string, options: RequestOptions): string {
  const base = config.apiBaseUrl;
  const url = new URL(`${base}${path}`, base === '' ? window.location.origin : base);

  if (options.token) url.searchParams.set('t', options.token);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? config.requestTimeoutMs,
  );

  // Дуудагчийн signal-ыг холбоно
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options), {
      method: options.method ?? 'GET',
      headers: options.formData ? {} : { 'content-type': 'application/json' },
      body: options.formData ?? (options.body === undefined ? null : JSON.stringify(options.body)),
      // Нэвтрэлтийн сесс cookie-гоор явна
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(0, 'NETWORK_ERROR', message, null);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `HTTP ${response.status}`,
      payload,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Тодорхой хаягууд
// ---------------------------------------------------------------------------

export const api = {
  // -------------------------------------------------------------------------
  // Нэвтрэлт
  // -------------------------------------------------------------------------
  me: () =>
    apiRequest<{ user: User | null; needsSetup: boolean }>('/api/auth/me', { timeoutMs: 8000 }),

  login: (username: string, password: string) =>
    apiRequest<{ user: User; expiresInDays: number }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    }),

  logout: () => apiRequest<void>('/api/auth/logout', { method: 'POST', body: {} }),

  logoutAll: () => apiRequest<void>('/api/auth/logout-all', { method: 'POST', body: {} }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ user: User }>('/api/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  // -------------------------------------------------------------------------
  // Админ
  // -------------------------------------------------------------------------
  adminOverview: () =>
    apiRequest<{
      teachers: number;
      admins: number;
      inactive: number;
      exams: number;
      submissions: number;
    }>('/api/admin/overview'),

  listUsers: () => apiRequest<{ users: User[] }>('/api/admin/users'),

  smtpStatus: () =>
    apiRequest<{
      ok: boolean;
      configured: boolean;
      message: string;
      settings: { host: string; port: number; secure: boolean; user: string; from: string };
    }>('/api/admin/smtp', { timeoutMs: 20_000 }),

  smtpTest: (to?: string) =>
    apiRequest<{ ok: boolean; message: string }>('/api/admin/smtp/test', {
      method: 'POST',
      body: to ? { to } : {},
      timeoutMs: 30_000,
    }),

  createUser: (input: {
    username: string;
    fullName: string;
    email?: string;
    role: UserRole;
    password?: string;
  }) =>
    apiRequest<{ user: User; tempPassword: string | null }>('/api/admin/users', {
      method: 'POST',
      body: input,
    }),

  updateUser: (
    userId: string,
    input: { fullName?: string; email?: string; role?: UserRole; isActive?: boolean },
  ) =>
    apiRequest<{ user: User }>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: input,
    }),

  resetUserPassword: (userId: string, password?: string) =>
    apiRequest<{ tempPassword: string }>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: password ? { password } : {},
    }),

  deleteUser: (userId: string) =>
    apiRequest<void>(`/api/admin/users/${userId}`, { method: 'DELETE' }),

  // -------------------------------------------------------------------------
  // Шалгалт
  // -------------------------------------------------------------------------
  listMyExams: () => apiRequest<{ exams: ExamListItem[] }>('/api/exams'),

  health: () =>
    apiRequest<{
      status: string;
      time: string;
      provider: string;
      database: string;
      /** Серверийн LAN хаягууд — QR-д зөв хаяг санал болгоход. */
      lanAddresses?: string[];
    }>('/api/health', { timeoutMs: 3000 }),

  createExam: (input: unknown) =>
    apiRequest<{ exam: Exam }>('/api/exams', { method: 'POST', body: input }),

  getExam: (examId: string, token?: string) =>
    apiRequest<{
      exam: Exam;
      isTeacher: boolean;
      counts?: { pre: number; post: number };
    }>(`/api/exams/${examId}`, token ? { token } : {}),

  updateExam: (examId: string, token: string | null | undefined, input: unknown) =>
    apiRequest<{ exam: Exam }>(`/api/exams/${examId}`, {
      method: 'PATCH',
      token,
      body: input,
    }),

  deleteExam: (examId: string, token?: string | null) =>
    apiRequest<void>(`/api/exams/${examId}`, { method: 'DELETE', token }),

  switchToPost: (examId: string, token?: string | null) =>
    apiRequest<{ exam: Exam; preCount: number }>(`/api/exams/${examId}/mode`, {
      method: 'POST',
      token,
      body: { mode: 'post' },
    }),

  submit: (examId: string, input: unknown) =>
    apiRequest<{ submission: Submission }>(`/api/exams/${examId}/submissions`, {
      method: 'POST',
      body: input,
    }),

  listSubmissions: (examId: string, token?: string | null, mode?: ExamMode) =>
    apiRequest<{ submissions: Submission[]; conflicts: Submission[] }>(
      `/api/exams/${examId}/submissions`,
      { token, query: mode ? { mode } : {} },
    ),

  mySubmissions: (examId: string, studentKey: string, mode?: ExamMode) =>
    apiRequest<{ submissions: Submission[] }>(`/api/exams/${examId}/submissions/mine`, {
      query: { studentKey, mode },
    }),

  deleteSubmission: (examId: string, token: string | null | undefined, submissionId: string) =>
    apiRequest<void>(`/api/exams/${examId}/submissions/${submissionId}`, {
      method: 'DELETE',
      token,
    }),

  sync: (body: { deviceId?: string; records: unknown[] }) =>
    apiRequest<{
      results: { id: string; status: 'ok' | 'duplicate' | 'error'; message?: string }[];
      ok: number;
      duplicate: number;
      error: number;
    }>('/api/sync', { method: 'POST', body, timeoutMs: 30_000 }),

  uploadReport: (
    examId: string,
    token: string | null | undefined,
    stats: ReportStats,
    docx?: Blob,
    send = false,
  ) => {
    const form = new FormData();
    form.append('stats', JSON.stringify(stats));
    if (docx) form.append('docx', docx, 'report.docx');
    return apiRequest<{ report: Report; email?: { status: string; to: string; error?: string } }>(
      `/api/exams/${examId}/reports`,
      {
        method: 'POST',
        token,
        formData: form,
        query: send ? { send: '1' } : {},
        timeoutMs: 60_000,
      },
    );
  },

  listReports: (examId: string, token?: string | null) =>
    apiRequest<{ reports: Report[]; emailQueue: EmailQueueItem[] }>(
      `/api/exams/${examId}/reports`,
      { token },
    ),

  sendReportEmail: (reportId: string, token?: string | null) =>
    apiRequest<{ email: { status: 'sent' | 'failed'; to: string; error?: string } }>(
      `/api/reports/${reportId}/email`,
      { method: 'POST', token, body: {}, timeoutMs: 60_000 },
    ),

  /**
   * CSV татах шууд линк. Нэвтэрсэн үед сесс cookie хангалттай тул токен
   * шаардлагагүй; зөвхөн хуваалцах линкээр орсон үед `?t=` нэмнэ.
   */
  exportCsvUrl: (examId: string, token?: string | null) =>
    `${config.apiBaseUrl}/api/exams/${examId}/export.csv` +
    (token ? `?t=${encodeURIComponent(token)}` : ''),
};
