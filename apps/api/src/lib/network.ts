/**
 * Сүлжээний туслахууд.
 */

import { networkInterfaces } from 'node:os';

/**
 * Хамгийн тохиромжтой LAN IPv4 хаягуудыг олно.
 *
 * Docker/WSL/Tailscale зэрэг виртуал адаптерыг жагсаалтын сүүл рүү тавина —
 * эхнийх нь ихэвчлэн бодит утсан/Wi-Fi холболт байна.
 */
export function detectLanAddresses(): string[] {
  const physical: string[] = [];
  const virtual: string[] = [];

  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      if (/^(veth|docker|br-|vEthernet|WSL|Tailscale|VirtualBox|VMware)/i.test(name)) {
        virtual.push(item.address);
      } else {
        physical.push(item.address);
      }
    }
  }

  return [...physical, ...virtual];
}

/** Хаяг нь loopback (localhost) эсэх. */
export function isLoopbackHost(host: string): boolean {
  return /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/i.test(host);
}
