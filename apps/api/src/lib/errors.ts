/**
 * Алдааны нэгдсэн хэлбэр: `{ error: { code, message } }`
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = DEFAULT_STATUS[code];
    if (details !== undefined) this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError('BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Багшийн токен буруу эсвэл байхгүй байна.'): ApiError {
    return new ApiError('UNAUTHORIZED', message);
  }
  static notFound(message = 'Хүссэн бичлэг олдсонгүй.'): ApiError {
    return new ApiError('NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError('CONFLICT', message, details);
  }
  static internal(message = 'Серверийн дотоод алдаа гарлаа.'): ApiError {
    return new ApiError('INTERNAL_ERROR', message);
  }
}
