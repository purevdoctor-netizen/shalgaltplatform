/**
 * Клиентийн тохиргоо — зөвхөн `VITE_` угтвартай хувьсагч браузерт хүрнэ.
 */

import { QR_DEFAULT_MAX_BYTES } from '@shalgalt/shared';

function readNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Хаяг нь loopback (localhost / 127.0.0.1) эсэх.
 *
 * ⚠ ЧУХАЛ: QR кодод loopback хаяг ОРОХ ЁСГҮЙ. Утас QR-ыг уншаад
 * `http://localhost:5173` руу орвол ӨӨРИЙНХӨӨ localhost руу ханддаг тул
 * "холбогдож чадсангүй" гэж гарна.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export const config = {
  appName: import.meta.env.VITE_APP_NAME || 'Шалгалтын платформ',

  /** Хоосон бол ижил origin (Vite proxy / nginx). */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),

  /**
   * QR код үүсгэхэд ашиглах нийтийн хаяг.
   *
   * Дараалал:
   *   1. `VITE_PUBLIC_APP_URL` тохируулсан бөгөөд loopback БИШ бол түүнийг
   *   2. Эс бөгөөс хуудсыг нээсэн бодит хаяг (`window.location.origin`)
   *
   * Ингэснээр багш `http://10.0.92.30:5173` хаягаар нээвэл QR нь мөн тэр
   * хаягийг заана — утаснаас ажиллана.
   */
  get publicAppUrl(): string {
    const configured = (import.meta.env.VITE_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
    const origin = typeof window === 'undefined' ? '' : window.location.origin;

    if (configured !== '' && !isLoopbackUrl(configured)) return configured;
    return origin || configured;
  },

  /** Одоогийн QR хаяг утаснаас ажиллах боломжгүй эсэх. */
  get publicUrlIsLoopback(): boolean {
    const url = config.publicAppUrl;
    return url === '' || isLoopbackUrl(url);
  },

  qrMaxBytes: readNumber(import.meta.env.VITE_QR_MAX_BYTES, QR_DEFAULT_MAX_BYTES),

  /** Sync heartbeat давтамж (мс) — даалгаварт 30 сек. */
  syncIntervalMs: 30_000,

  /** API хүсэлтийн хугацааны хязгаар (мс). */
  requestTimeoutMs: 10_000,
} as const;
