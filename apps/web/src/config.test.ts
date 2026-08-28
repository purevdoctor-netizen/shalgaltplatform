/**
 * QR кодод loopback хаяг ОРОХГҮЙ байхыг баталгаажуулна.
 *
 * Энэ бол бодит алдаанаас урган гарсан тест: `VITE_PUBLIC_APP_URL` нь
 * `http://localhost:5173` байсан тул QR дотор `localhost` бичигдэж, утас
 * уншихдаа өөрийнхөө localhost руу ханддаг байв.
 */

import { describe, expect, it } from 'vitest';
import { isLoopbackUrl } from './config';

describe('isLoopbackUrl', () => {
  it('loopback хаягуудыг таньна', () => {
    expect(isLoopbackUrl('http://localhost:5173')).toBe(true);
    expect(isLoopbackUrl('http://localhost')).toBe(true);
    expect(isLoopbackUrl('https://localhost:8080/зам')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:5173')).toBe(true);
  });

  it('LAN болон нийтийн хаягийг loopback гэж үзэхгүй', () => {
    expect(isLoopbackUrl('http://10.0.92.30:5173')).toBe(false);
    expect(isLoopbackUrl('http://192.168.1.50:8080')).toBe(false);
    expect(isLoopbackUrl('http://172.16.4.2')).toBe(false);
    expect(isLoopbackUrl('https://shalgalt.example.mn')).toBe(false);
  });

  it('буруу форматтай хаягт false буцаана (алдаа шидэхгүй)', () => {
    expect(isLoopbackUrl('')).toBe(false);
    expect(isLoopbackUrl('зүгээр текст')).toBe(false);
    expect(isLoopbackUrl('localhost:5173')).toBe(false);
  });

  it('localhost агуулсан домэйныг андуурахгүй', () => {
    // "localhost" гэсэн үг агуулсан ч loopback БИШ
    expect(isLoopbackUrl('http://localhost.example.mn')).toBe(false);
    expect(isLoopbackUrl('http://my-localhost-server.mn:5173')).toBe(false);
  });
});
