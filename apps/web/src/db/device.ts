/**
 * Тогтвортой `deviceId`.
 *
 * ASSUMPTION (Ш3): Төхөөрөмжийн танигч нь IndexedDB-д хадгалагдана. Хэрэглэгч
 * браузерын өгөгдлөө цэвэрлэвэл шинэ id үүснэ — энэ нь зөвхөн оношилгоо,
 * давхардал ажиглахад ашиглагддаг тул алдагдсан ч логик эвдэрдэггүй.
 * `crypto.randomUUID` байхгүй хуучин браузерт `getRandomValues`-ээр нөхнө.
 */

import { getSetting, setSetting } from './index';

const DEVICE_KEY = 'deviceId';

function randomUuid(): string {
  const cryptoRef = globalThis.crypto;
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();

  const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached !== null) return cached;

  const stored = await getSetting<string | null>(DEVICE_KEY, null);
  if (stored) {
    cached = stored;
    return stored;
  }

  const created = randomUuid();
  await setSetting(DEVICE_KEY, created);
  cached = created;
  return created;
}
