/**
 * Express-ийн жижиг туслахууд.
 *
 * `noUncheckedIndexedAccess` идэвхтэй тул `req.params.id` нь
 * `string | undefined` төрөлтэй болдог. Route бүрд шалгалт бичихийн оронд
 * энэ туслахыг ашиглана.
 */

import type { Request } from 'express';
import { ApiError } from './errors';

/** Заавал байх ёстой зам параметр. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value === '') {
    throw ApiError.badRequest(`"${name}" зам параметр шаардлагатай.`);
  }
  return value;
}

/** Хүсэлт илгээгчийн бодит IP (reverse proxy-г тооцно). */
export function clientIp(req: Request): string {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return req.ip ?? 'unknown';
}
