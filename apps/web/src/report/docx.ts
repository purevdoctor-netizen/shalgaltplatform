/**
 * Word (.docx) тайлан үүсгэгч — БҮГД браузер дээр ажиллана (офлайн ажиллана).
 *
 * Бүтэц (даалгаврын 8 хэсэг):
 *   1. Нүүр
 *   2. Хураангуй — 2×3 KPI хүснэгт
 *   3. Бүлгийн статистикийн хүснэгт
 *   4. График (4 PNG зураг)
 *   5. Асуулт бүрийн хүснэгт
 *   6. Сурагч бүрийн хүснэгт
 *   7. Дүгнэлт, зөвлөмж
 *   8. Хавсралт — асуултууд зөв хариулттай
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Exam, ItemStat, ReportStats, StudentResult } from '@shalgalt/shared';
import { CATEGORY_LABELS_MN, effectSizeLabel } from '@shalgalt/shared';

/**
 * ASSUMPTION (Ш6): Даалгаварт Arial гэж заасан. Arial байхгүй систем
 * (ихэвчлэн Linux/LibreOffice) дээр зөв харагдахын тулд docx-ийн үндсэн
 * фонтыг Arial болгож, тэмдэглэлд Liberation Sans / Helvetica-г нөөц болгоно.
 */
const FONT = 'Arial';

const INDIGO = '4F46E5';
const INDIGO_LIGHT = 'EEF2FF';
const SLATE = '334155';
const SLATE_LIGHT = 'F8FAFC';
const GREEN = '16A34A';
const RED = 'DC2626';
const WHITE = 'FFFFFF';

/**
 * ASSUMPTION (Ш6): График 1200×700 px, 2x scale-аар авагдана.
 * A4-ийн бичих талбар ≈ 17 см = 6.69 инч. 1200×700 харьцааг хадгалж
 * 620×362 pt (docx нь px-ийг 96 dpi гэж үзнэ) болгож байрлуулна.
 */
const IMAGE_WIDTH = 620;
const IMAGE_HEIGHT = Math.round((IMAGE_WIDTH * 700) / 1200);

// ---------------------------------------------------------------------------
// Туслахууд
// ---------------------------------------------------------------------------

function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}${suffix}`;
}

function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function gainSymbol(value: number | null): string {
  if (value === null) return '—';
  if (value > 0) return '▲';
  if (value < 0) return '▼';
  return '■';
}

function text(content: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text: content,
    font: FONT,
    bold: options.bold ?? false,
    size: options.size ?? 20, // half-points → 10pt
    ...(options.color ? { color: options.color } : {}),
  });
}

function para(
  content: string,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  } = {},
): Paragraph {
  return new Paragraph({
    ...(options.heading ? { heading: options.heading } : {}),
    ...(options.align ? { alignment: options.align } : {}),
    spacing: { after: options.spacingAfter ?? 120 },
    children: [text(content, options)],
  });
}

function heading(content: string, level: 1 | 2 = 1): Paragraph {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [text(content, { bold: true, size: level === 1 ? 30 : 24, color: INDIGO })],
  });
}

function cell(
  content: string,
  options: {
    bold?: boolean;
    header?: boolean;
    align?: 'left' | 'center' | 'right';
    color?: string;
  } = {},
): TableCell {
  const alignment =
    options.align === 'right'
      ? AlignmentType.RIGHT
      : options.align === 'center'
        ? AlignmentType.CENTER
        : AlignmentType.LEFT;

  return new TableCell({
    shading: options.header
      ? { type: ShadingType.CLEAR, fill: INDIGO, color: 'auto' }
      : { type: ShadingType.CLEAR, fill: WHITE, color: 'auto' },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment,
        spacing: { after: 0 },
        children: [
          text(content, {
            bold: options.bold ?? options.header ?? false,
            size: 18,
            ...(options.header ? { color: WHITE } : options.color ? { color: options.color } : {}),
          }),
        ],
      }),
    ],
  });
}

function table(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
    },
    rows,
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}

/** PNG data URL → Uint8Array */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageParagraph(dataUrl: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new ImageRun({
        type: 'png',
        data: dataUrlToBytes(dataUrl),
        transformation: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Гол функц
// ---------------------------------------------------------------------------

export interface DocxCharts {
  prePost?: string;
  studentGain?: string;
  itemCorrect?: string;
  categoryShare?: string;
}

export async function buildReportDocx(
  exam: Exam,
  stats: ReportStats,
  charts: DocxCharts,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // -------------------------------------------------------------------------
  // 1. Нүүр
  // -------------------------------------------------------------------------
  children.push(
    new Paragraph({ spacing: { after: 600 }, children: [] }),
    // Лого зай (тэмдэглэл: байгууллагын лого энд орно)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 12, color: INDIGO },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: INDIGO },
      },
      children: [text('[ ЛОГО ]', { size: 18, color: '94A3B8' })],
    }),
    para('ӨМНӨХ / ДАРААХ ҮНЭЛГЭЭНИЙ ТАЙЛАН', {
      bold: true,
      size: 24,
      color: INDIGO,
      align: AlignmentType.CENTER,
      spacingAfter: 200,
    }),
    para(exam.title, {
      bold: true,
      size: 40,
      align: AlignmentType.CENTER,
      spacingAfter: 240,
    }),
    para(`Хичээл: ${exam.subject}`, { size: 24, align: AlignmentType.CENTER, spacingAfter: 80 }),
    para(`Багш: ${exam.teacherName}`, { size: 24, align: AlignmentType.CENTER, spacingAfter: 80 }),
    para(`Огноо: ${exam.examDate}`, { size: 24, align: AlignmentType.CENTER, spacingAfter: 320 }),
    para(`Оролцогч: ӨМНӨХ ${stats.nPre} · ДАРААХ ${stats.nPost} · хосолсон ${stats.nPaired}`, {
      size: 22,
      align: AlignmentType.CENTER,
      color: SLATE,
    }),
  );

  if (stats.lowSampleWarning) {
    children.push(
      para('⚠ Түүвэр бага тул статистик найдвартай биш болохыг анхаарна уу.', {
        size: 20,
        color: 'B45309',
        align: AlignmentType.CENTER,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 2. Хураангуй — 2×3 KPI
  // -------------------------------------------------------------------------
  children.push(heading('1. Хураангуй'));

  const kpi: [string, string][] = [
    ['Дундаж дүн', `${fmt(stats.pre?.mean, 2, '%')} → ${fmt(stats.post?.mean, 2, '%')}`],
    ['Дундаж ахиц', signed(stats.meanAbsGain) + ' нэгж'],
    ['Хейкийн ахиц ⟨g⟩', fmt(stats.hakeGain, 3)],
    ['Тэнцсэн хувь', `${fmt(stats.pre?.passRate, 2, '%')} → ${fmt(stats.post?.passRate, 2, '%')}`],
    [
      "Cohen's d",
      stats.cohenD === null
        ? '—'
        : `${fmt(stats.cohenD)} (${effectSizeLabel(stats.cohenD)} үр нөлөө)`,
    ],
    [
      'p-утга',
      stats.pValue === null
        ? '—'
        : `${stats.pValue < 0.0001 ? '<0.0001' : stats.pValue.toFixed(4)} (${
            stats.pValue < 0.05 ? 'ач холбогдолтой' : 'ач холбогдолгүй'
          })`,
    ],
  ];

  const kpiRows: TableRow[] = [];
  for (let row = 0; row < 2; row++) {
    const labelCells: TableCell[] = [];
    const valueCells: TableCell[] = [];
    for (let column = 0; column < 3; column++) {
      const entry = kpi[row * 3 + column];
      if (!entry) continue;
      labelCells.push(cell(entry[0], { header: true, align: 'center' }));
      valueCells.push(cell(entry[1], { bold: true, align: 'center' }));
    }
    kpiRows.push(new TableRow({ children: labelCells, tableHeader: true }));
    kpiRows.push(new TableRow({ children: valueCells }));
  }
  children.push(table(kpiRows), spacer());

  // -------------------------------------------------------------------------
  // 3. Бүлгийн статистик
  // -------------------------------------------------------------------------
  children.push(heading('2. Бүлгийн статистик'));

  const statHeader = new TableRow({
    tableHeader: true,
    children: [
      cell('Үзүүлэлт', { header: true }),
      cell('ӨМНӨХ', { header: true, align: 'right' }),
      cell('ДАРААХ', { header: true, align: 'right' }),
    ],
  });

  const statRows: [string, string, string][] = [
    ['Тоо (n)', String(stats.pre?.n ?? 0), String(stats.post?.n ?? 0)],
    ['Дундаж', fmt(stats.pre?.mean, 2, '%'), fmt(stats.post?.mean, 2, '%')],
    ['Медиан', fmt(stats.pre?.median, 2, '%'), fmt(stats.post?.median, 2, '%')],
    ['Стандарт хазайлт', fmt(stats.pre?.sd), fmt(stats.post?.sd)],
    ['Хамгийн бага', fmt(stats.pre?.min, 2, '%'), fmt(stats.post?.min, 2, '%')],
    ['Хамгийн их', fmt(stats.pre?.max, 2, '%'), fmt(stats.post?.max, 2, '%')],
    ['Тэнцсэн хувь', fmt(stats.pre?.passRate, 2, '%'), fmt(stats.post?.passRate, 2, '%')],
  ];

  children.push(
    table([
      statHeader,
      ...statRows.map(
        (row) =>
          new TableRow({
            children: [
              cell(row[0]),
              cell(row[1], { align: 'right' }),
              cell(row[2], { align: 'right' }),
            ],
          }),
      ),
    ]),
    spacer(),
  );

  // -------------------------------------------------------------------------
  // 4. График
  // -------------------------------------------------------------------------
  children.push(heading('3. График'));

  const chartList: [string, string | undefined][] = [
    ['(а) ӨМНӨХ / ДАРААХ дундаж', charts.prePost],
    ['(б) Сурагч бүрийн ахиц', charts.studentGain],
    ['(в) Асуулт бүрийн зөв хариултын хувь', charts.itemCorrect],
    ['(г) Ангиллын хуваарилалт', charts.categoryShare],
  ];

  for (const [title, dataUrl] of chartList) {
    children.push(para(title, { bold: true, size: 20 }));
    if (dataUrl) {
      children.push(imageParagraph(dataUrl));
    } else {
      children.push(para('(график үүсгэх боломжгүй байлаа)', { size: 18, color: '94A3B8' }));
    }
  }

  // -------------------------------------------------------------------------
  // 5. Асуулт бүрийн хүснэгт
  // -------------------------------------------------------------------------
  children.push(heading('4. Асуулт бүрийн үзүүлэлт'));

  const questionById = new Map(exam.questions.map((question) => [question.id, question]));

  children.push(
    table([
      new TableRow({
        tableHeader: true,
        children: [
          cell('№', { header: true, align: 'center' }),
          cell('Сэдэв', { header: true }),
          cell('ӨМНӨХ %', { header: true, align: 'right' }),
          cell('ДАРААХ %', { header: true, align: 'right' }),
          cell('Ахиц', { header: true, align: 'right' }),
          cell('', { header: true, align: 'center' }),
        ],
      }),
      ...stats.items.map((item: ItemStat) => {
        const question = questionById.get(item.questionId);
        return new TableRow({
          children: [
            cell(String(item.order), { align: 'center' }),
            cell(item.topic ?? question?.topic ?? '—'),
            cell(fmt(item.preCorrectPct, 1, '%'), { align: 'right' }),
            cell(fmt(item.postCorrectPct, 1, '%'), { align: 'right' }),
            cell(signed(item.gain, 1), {
              align: 'right',
              color: (item.gain ?? 0) > 0 ? GREEN : (item.gain ?? 0) < 0 ? RED : SLATE,
            }),
            cell(gainSymbol(item.gain), {
              align: 'center',
              color: (item.gain ?? 0) > 0 ? GREEN : (item.gain ?? 0) < 0 ? RED : SLATE,
            }),
          ],
        });
      }),
    ]),
    spacer(),
  );

  // Сэдвийн хураангуй
  if (stats.topics.length > 0) {
    children.push(para('Сэдвийн ахиц', { bold: true, size: 20 }));
    children.push(
      table([
        new TableRow({
          tableHeader: true,
          children: [
            cell('Сэдэв', { header: true }),
            cell('Асуултын тоо', { header: true, align: 'center' }),
            cell('Ахиц', { header: true, align: 'right' }),
          ],
        }),
        ...stats.topics.map(
          (topic) =>
            new TableRow({
              children: [
                cell(topic.topic),
                cell(String(topic.nItems), { align: 'center' }),
                cell(signed(topic.gain, 1), {
                  align: 'right',
                  color: topic.gain > 0 ? GREEN : topic.gain < 0 ? RED : SLATE,
                }),
              ],
            }),
        ),
      ]),
      spacer(),
    );
  }

  // -------------------------------------------------------------------------
  // 6. Сурагч бүрийн хүснэгт
  // -------------------------------------------------------------------------
  children.push(heading('5. Сурагч бүрийн үр дүн'));

  const paired = stats.students.filter((student) => student.absGain !== null);
  const unpaired = stats.students.filter((student) => student.absGain === null);

  const studentRow = (student: StudentResult) =>
    new TableRow({
      children: [
        cell(student.lastName),
        cell(student.firstName),
        cell(student.className, { align: 'center' }),
        cell(fmt(student.prePercent, 1, '%'), { align: 'right' }),
        cell(fmt(student.postPercent, 1, '%'), { align: 'right' }),
        cell(signed(student.absGain, 1), {
          align: 'right',
          color: (student.absGain ?? 0) > 0 ? GREEN : (student.absGain ?? 0) < 0 ? RED : SLATE,
        }),
        cell(fmt(student.normGain, 3), { align: 'right' }),
        cell(CATEGORY_LABELS_MN[student.category], { align: 'center' }),
      ],
    });

  children.push(
    table([
      new TableRow({
        tableHeader: true,
        children: [
          cell('Овог', { header: true }),
          cell('Нэр', { header: true }),
          cell('Анги', { header: true, align: 'center' }),
          cell('ӨМНӨХ', { header: true, align: 'right' }),
          cell('ДАРААХ', { header: true, align: 'right' }),
          cell('Ахиц', { header: true, align: 'right' }),
          cell('⟨g⟩', { header: true, align: 'right' }),
          cell('Ангилал', { header: true, align: 'center' }),
        ],
      }),
      ...paired.map(studentRow),
      ...unpaired.map(studentRow),
    ]),
    spacer(),
  );

  // -------------------------------------------------------------------------
  // 7. Дүгнэлт, зөвлөмж
  // -------------------------------------------------------------------------
  children.push(heading('6. Дүгнэлт'));
  children.push(para(stats.conclusions.overall, { size: 22 }));
  children.push(para(stats.conclusions.bestTopic, { size: 22 }));
  children.push(para(stats.conclusions.weakTopic, { size: 22 }));
  children.push(para(stats.conclusions.attentionStudents, { size: 22 }));

  children.push(heading('7. Зөвлөмж', 2));
  stats.conclusions.recommendations.forEach((recommendation, index) => {
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [text(`${index + 1}. ${recommendation}`, { size: 22 })],
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 8. Хавсралт — асуултууд зөв хариулттай
  // -------------------------------------------------------------------------
  children.push(
    new Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [] }),
    heading('8. Хавсралт — асуултууд ба зөв хариулт'),
  );

  for (const question of exam.questions.slice().sort((a, b) => a.order - b.order)) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [
          text(`${question.order}. `, { bold: true, size: 20 }),
          text(question.text, { size: 20 }),
          text(`  (${question.points} оноо${question.topic ? ` · ${question.topic}` : ''})`, {
            size: 18,
            color: '94A3B8',
          }),
        ],
      }),
    );

    if (question.options && question.options.length > 0) {
      for (const option of question.options) {
        const correct = (question.correctOptionIds ?? []).includes(option.id);
        children.push(
          new Paragraph({
            indent: { left: 480 },
            spacing: { after: 40 },
            children: [
              text(`${correct ? '✔ ' : '   '}${option.id}. ${option.text}`, {
                size: 20,
                bold: correct,
                ...(correct ? { color: GREEN } : {}),
              }),
            ],
          }),
        );
      }
    }

    if (question.type === 'short') {
      children.push(
        new Paragraph({
          indent: { left: 480 },
          spacing: { after: 40 },
          children: [
            text(`✔ ${(question.acceptedAnswers ?? []).join('  /  ')}`, {
              size: 20,
              bold: true,
              color: GREEN,
            }),
          ],
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Баримт угсрах
  // -------------------------------------------------------------------------
  const document = new Document({
    creator: exam.teacherName,
    title: exam.title,
    description: 'Өмнөх/дараах үнэлгээний тайлан',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: 18,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}

export { SLATE_LIGHT, INDIGO_LIGHT };
