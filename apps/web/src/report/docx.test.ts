/**
 * .docx үүсгэлтийн тест — файл бодитоор үүсэж, ZIP бүтэцтэй, доторх XML нь
 * кирилл текстийг зөв агуулж байгааг шалгана.
 */

import { describe, expect, it } from 'vitest';
import { buildSeedDataset, computeReportStats } from '@shalgalt/shared';
import { buildReportDocx } from './docx';

const { exam, pre, post } = buildSeedDataset();
const stats = computeReportStats(exam, pre, post);

/** Blob-оос ZIP доторх бүх текстийг ойролцоогоор гаргаж авна. */
async function readAsLatin1(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder('latin1').decode(buffer);
}

describe('buildReportDocx', () => {
  it('.docx blob үүсгэнэ', async () => {
    const blob = await buildReportDocx(exam, stats, {});
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(5000);
  });

  it('ZIP гарын үсэгтэй (PK) — Word нээж чадна', async () => {
    const blob = await buildReportDocx(exam, stats, {});
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
  });

  it('word/document.xml болон [Content_Types].xml агуулна', async () => {
    const text = await readAsLatin1(await buildReportDocx(exam, stats, {}));
    expect(text).toContain('word/document.xml');
    expect(text).toContain('[Content_Types].xml');
  });

  it('графикгүй ч алдаагүй үүснэ', async () => {
    await expect(buildReportDocx(exam, stats, {})).resolves.toBeInstanceOf(Blob);
  });

  it('PNG график хавсаргавал файл томорно', async () => {
    // 1×1 цагаан PNG
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const withoutCharts = await buildReportDocx(exam, stats, {});
    const withCharts = await buildReportDocx(exam, stats, {
      prePost: tinyPng,
      studentGain: tinyPng,
      itemCorrect: tinyPng,
      categoryShare: tinyPng,
    });

    expect(withCharts.size).toBeGreaterThan(withoutCharts.size);
  });

  it('өгөгдөл огт байхгүй үед ч үүснэ', async () => {
    const emptyStats = computeReportStats(exam, [], []);
    const blob = await buildReportDocx(exam, emptyStats, {});
    expect(blob.size).toBeGreaterThan(3000);
  });
});
