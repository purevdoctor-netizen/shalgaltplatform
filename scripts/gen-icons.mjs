/**
 * PWA-ийн дүрсүүдийг үүсгэнэ (`node scripts/gen-icons.mjs`).
 *
 * Гадаад сан ашиглахгүй — Node-ийн `zlib`-ээр PNG-г шууд кодчилно.
 * Дүрс: индиго дэвсгэр дээр цагаан "✓" тэмдэг + QR-ын булангийн хээ.
 *
 * Гаралт: apps/web/public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 *         apps/web/public/favicon.svg
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../apps/web/public');
const iconsDir = resolve(publicDir, 'icons');

// ---------------------------------------------------------------------------
// Хамгийн бага PNG кодлогч (RGBA, 8 бит)
// ---------------------------------------------------------------------------

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** @param {number} width @param {number} height @param {Uint8Array} rgba */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  // Мөр бүрийн өмнө filter байт (0 = None)
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит гүн
  ihdr[9] = 6; // өнгөний төрөл: RGBA
  ihdr[10] = 0; // шахалт
  ihdr[11] = 0; // фильтр
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Дүрс зурах
// ---------------------------------------------------------------------------

const INDIGO = [79, 70, 229];
const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];

/**
 * @param {number} size
 * @param {boolean} maskable  true бол дэвсгэрийг булан хүртэл дүүргэж, агуулгыг
 *                            аюулгүй бүсэд (80%) багтаана.
 */
function drawIcon(size, maskable) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const scale = maskable ? 0.62 : 0.78;

  const set = (x, y, [r, g, b], alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 4;
    const a = alpha / 255;
    pixels[index] = Math.round(pixels[index] * (1 - a) + r * a);
    pixels[index + 1] = Math.round(pixels[index + 1] * (1 - a) + g * a);
    pixels[index + 2] = Math.round(pixels[index + 2] * (1 - a) + b * a);
    pixels[index + 3] = Math.max(pixels[index + 3], alpha);
  };

  // 1. Дэвсгэр — indigo → blue градиент, дугуй булантай
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (radius > 0) {
        const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
        const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
        if (dx * dx + dy * dy > radius * radius) continue;
      }
      const t = (x + y) / (2 * size);
      set(x, y, [
        Math.round(INDIGO[0] + (BLUE[0] - INDIGO[0]) * t),
        Math.round(INDIGO[1] + (BLUE[1] - INDIGO[1]) * t),
        Math.round(INDIGO[2] + (BLUE[2] - INDIGO[2]) * t),
      ]);
    }
  }

  // 2. QR-ын булангийн 3 хайрцаг
  const inner = Math.round(size * scale);
  const offset = Math.round((size - inner) / 2);
  const cell = inner / 7;
  const thickness = Math.max(2, Math.round(cell * 0.34));

  const finder = (col, row) => {
    const x0 = offset + Math.round(col * cell);
    const y0 = offset + Math.round(row * cell);
    const box = Math.round(cell * 2.2);
    for (let y = y0; y < y0 + box; y++) {
      for (let x = x0; x < x0 + box; x++) {
        const onBorder =
          x < x0 + thickness ||
          x >= x0 + box - thickness ||
          y < y0 + thickness ||
          y >= y0 + box - thickness;
        const inCenter =
          x >= x0 + box * 0.34 &&
          x < x0 + box * 0.66 &&
          y >= y0 + box * 0.34 &&
          y < y0 + box * 0.66;
        if (onBorder || inCenter) set(x, y, WHITE);
      }
    }
  };

  finder(0, 0);
  finder(4.8, 0);
  finder(0, 4.8);

  // 3. Баруун доод буланд "✓" — ахиц/зөв хариултын тэмдэг
  const checkThickness = Math.max(3, Math.round(size * 0.055));
  const cx = offset + inner * 0.72;
  const cy = offset + inner * 0.72;
  const arm = inner * 0.13;

  const line = (x1, y1, x2, y2) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (let dy = -checkThickness / 2; dy <= checkThickness / 2; dy++) {
        for (let dx = -checkThickness / 2; dx <= checkThickness / 2; dx++) {
          if (dx * dx + dy * dy <= (checkThickness / 2) ** 2) {
            set(Math.round(px + dx), Math.round(py + dy), WHITE);
          }
        }
      }
    }
  };

  line(cx - arm, cy, cx - arm * 0.25, cy + arm * 0.7);
  line(cx - arm * 0.25, cy + arm * 0.7, cx + arm, cy - arm * 0.8);

  return pixels;
}

// ---------------------------------------------------------------------------

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Шалгалтын платформ">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="4">
    <rect x="12" y="12" width="14" height="14" rx="2"/>
    <rect x="38" y="12" width="14" height="14" rx="2"/>
    <rect x="12" y="38" width="14" height="14" rx="2"/>
  </g>
  <g fill="#fff">
    <rect x="17" y="17" width="4" height="4"/>
    <rect x="43" y="17" width="4" height="4"/>
    <rect x="17" y="43" width="4" height="4"/>
  </g>
  <path d="M35 45l5 5 12-13" fill="none" stroke="#fff" stroke-width="5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

mkdirSync(iconsDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: true },
];

for (const target of targets) {
  const png = encodePng(target.size, target.size, drawIcon(target.size, target.maskable));
  writeFileSync(resolve(iconsDir, target.name), png);
  console.info(`  ✔ icons/${target.name}  (${target.size}×${target.size}, ${png.length} байт)`);
}

writeFileSync(resolve(publicDir, 'favicon.svg'), FAVICON_SVG, 'utf8');
console.info('  ✔ favicon.svg');
console.info('\nДүрсүүд үүслээ.');
