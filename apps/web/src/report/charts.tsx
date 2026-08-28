/**
 * Тайлангийн 4 график (Recharts). Эдгээрийг `html-to-image`-ээр PNG болгож
 * .docx дотор оруулна — тиймээс анимацгүй, тогтмол хэмжээтэй байх ёстой.
 */

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { ReportStats, StudentResult } from '@shalgalt/shared';
import { CATEGORY_LABELS_MN } from '@shalgalt/shared';

export const CHART_WIDTH = 1200;
export const CHART_HEIGHT = 700;

export const CHART_IDS = {
  prePost: 'chart-pre-post',
  studentGain: 'chart-student-gain',
  itemCorrect: 'chart-item-correct',
  categoryShare: 'chart-category-share',
} as const;

const COLORS = {
  pre: '#94a3b8',
  post: '#4f46e5',
  high: '#16a34a',
  medium: '#22c55e',
  low: '#f59e0b',
  declined: '#dc2626',
  preOnly: '#94a3b8',
  postOnly: '#64748b',
} as const;

const AXIS_STYLE = { fontSize: 18, fill: '#334155' } as const;

/** Графикийг PNG болгохын тулд DOM-д байрлуулах хүрээ. */
function ChartFrame({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      style={{
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        background: '#ffffff',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <p style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 700, color: '#0f172a' }}>{title}</p>
      <div style={{ width: '100%', height: CHART_HEIGHT - 80 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) pre/post дундаж bar
// ---------------------------------------------------------------------------

export function PrePostMeanChart({ stats, labels }: { stats: ReportStats; labels: ChartLabels }) {
  const data = [
    {
      name: labels.mean,
      [labels.pre]: stats.pre?.mean ?? 0,
      [labels.post]: stats.post?.mean ?? 0,
    },
    {
      name: labels.median,
      [labels.pre]: stats.pre?.median ?? 0,
      [labels.post]: stats.post?.median ?? 0,
    },
    {
      name: labels.passRate,
      [labels.pre]: stats.pre?.passRate ?? 0,
      [labels.post]: stats.post?.passRate ?? 0,
    },
  ];

  return (
    <ChartFrame id={CHART_IDS.prePost} title={labels.prePostTitle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={AXIS_STYLE} />
          <YAxis domain={[0, 100]} tick={AXIS_STYLE} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 18 }} />
          <Bar
            dataKey={labels.pre}
            fill={COLORS.pre}
            isAnimationActive={false}
            radius={[6, 6, 0, 0]}
          />
          <Bar
            dataKey={labels.post}
            fill={COLORS.post}
            isAnimationActive={false}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (b) сурагч бүрийн absGain
// ---------------------------------------------------------------------------

export function StudentGainChart({ stats, labels }: { stats: ReportStats; labels: ChartLabels }) {
  const data = stats.students
    .filter((student): student is StudentResult & { absGain: number } => student.absGain !== null)
    .map((student) => ({
      name: `${student.lastName} ${student.firstName.slice(0, 1)}.`,
      gain: student.absGain,
      category: student.category,
    }));

  return (
    <ChartFrame id={CHART_IDS.studentGain} title={labels.studentGainTitle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 24, bottom: 90, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ ...AXIS_STYLE, fontSize: 15 }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={90}
          />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip />
          <Bar dataKey="gain" isAnimationActive={false} radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={COLORS[entry.category as keyof typeof COLORS] ?? COLORS.post}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (c) асуулт бүрийн зөв % grouped bar
// ---------------------------------------------------------------------------

export function ItemCorrectChart({ stats, labels }: { stats: ReportStats; labels: ChartLabels }) {
  const data = stats.items.map((item) => ({
    name: `№${item.order}`,
    [labels.pre]: item.preCorrectPct ?? 0,
    [labels.post]: item.postCorrectPct ?? 0,
  }));

  return (
    <ChartFrame id={CHART_IDS.itemCorrect} title={labels.itemCorrectTitle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={AXIS_STYLE} interval={0} />
          <YAxis domain={[0, 100]} tick={AXIS_STYLE} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 18 }} />
          <Bar
            dataKey={labels.pre}
            fill={COLORS.pre}
            isAnimationActive={false}
            radius={[6, 6, 0, 0]}
          />
          <Bar
            dataKey={labels.post}
            fill={COLORS.post}
            isAnimationActive={false}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (d) ангиллын хуваарилалт (donut)
// ---------------------------------------------------------------------------

export function CategoryShareChart({ stats, labels }: { stats: ReportStats; labels: ChartLabels }) {
  const data = (Object.keys(stats.categoryCounts) as (keyof typeof stats.categoryCounts)[])
    .map((key) => ({
      name: CATEGORY_LABELS_MN[key],
      value: stats.categoryCounts[key],
      key,
    }))
    .filter((entry) => entry.value > 0);

  return (
    <ChartFrame id={CHART_IDS.categoryShare} title={labels.categoryShareTitle}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="45%"
            outerRadius="75%"
            isAnimationActive={false}
            label={(entry: { name?: string; value?: number }) => `${entry.name}: ${entry.value}`}
            labelLine
            style={{ fontSize: 18 }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={COLORS[entry.key as keyof typeof COLORS] ?? COLORS.post}
              />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 18 }} />
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------

export interface ChartLabels {
  pre: string;
  post: string;
  mean: string;
  median: string;
  passRate: string;
  prePostTitle: string;
  studentGainTitle: string;
  itemCorrectTitle: string;
  categoryShareTitle: string;
}

/** 4 графикийг нэг дор (дэлгэцээс нуусан) байрлуулна — PNG авахад бэлэн. */
export function ReportCharts({ stats, labels }: { stats: ReportStats; labels: ChartLabels }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: -100000,
        top: 0,
        width: CHART_WIDTH,
        pointerEvents: 'none',
      }}
    >
      <PrePostMeanChart stats={stats} labels={labels} />
      <StudentGainChart stats={stats} labels={labels} />
      <ItemCorrectChart stats={stats} labels={labels} />
      <CategoryShareChart stats={stats} labels={labels} />
    </div>
  );
}
