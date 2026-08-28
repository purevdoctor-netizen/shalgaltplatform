/**
 * Алхам 6 — Анализ, тайлан, имэйл.
 *
 * .docx болон графикийн PNG бүгд КЛИЕНТ дээр үүснэ (офлайн ажиллана).
 * Имэйл илгээхэд .docx-ыг серверт байршуулна.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Download, FileText, LayoutDashboard, Mail, RefreshCw } from 'lucide-react';
import type { Submission } from '@shalgalt/shared';
import { CATEGORY_LABELS_MN, computeReportStats, effectSizeLabel } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useTeacherExam } from '../../lib/useTeacherExam';
import { db, listLocalSubmissions } from '../../db';
import { syncEngine } from '../../sync/engine';
import { useSyncStatus } from '../../sync/useSync';
import {
  CHART_HEIGHT,
  CHART_IDS,
  CHART_WIDTH,
  ReportCharts,
  type ChartLabels,
} from '../../report/charts';
import { buildReportDocx, type DocxCharts } from '../../report/docx';
import {
  downloadBlob,
  formatNumber,
  formatPercent,
  formatSigned,
  safeFileName,
  shortId,
} from '../../lib/utils';

export default function ReportPage() {
  const t = useT();
  const toast = useToast();
  const { online, lastSyncAt } = useSyncStatus();
  const { exam, token, loading, error } = useTeacherExam();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [localReportId, setLocalReportId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'pending' | 'sent' | 'failed'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const chartsMounted = useRef(false);

  // -------------------------------------------------------------------------
  // Өгөгдөл ачаалах
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam) return;
    let cancelled = false;

    void (async () => {
      setLoadingData(true);
      try {
        if (token) {
          const response = await api.listSubmissions(exam.id, token);
          const local = await listLocalSubmissions(exam.id);
          const byId = new Map(response.submissions.map((item) => [item.id, item]));
          for (const item of local) byId.set(item.id, byId.get(item.id) ?? item);
          if (!cancelled) setSubmissions([...byId.values()]);
        } else {
          const local = await listLocalSubmissions(exam.id);
          if (!cancelled) setSubmissions(local);
        }
      } catch {
        const local = await listLocalSubmissions(exam.id);
        if (!cancelled) setSubmissions(local);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exam, token, lastSyncAt]);

  const pre = useMemo(() => submissions.filter((item) => item.mode === 'pre'), [submissions]);
  const post = useMemo(() => submissions.filter((item) => item.mode === 'post'), [submissions]);

  const stats = useMemo(
    () => (exam ? computeReportStats(exam, pre, post) : null),
    [exam, pre, post],
  );

  const chartLabels: ChartLabels = useMemo(
    () => ({
      pre: t('teacher.stats.pre'),
      post: t('teacher.stats.post'),
      mean: t('stats.mean'),
      median: t('stats.median'),
      passRate: t('stats.passRate'),
      prePostTitle: t('chart.prePostMean'),
      studentGainTitle: t('chart.studentGain'),
      itemCorrectTitle: t('chart.itemCorrect'),
      categoryShareTitle: t('chart.categoryShare'),
    }),
    [t],
  );

  useEffect(() => {
    if (stats) chartsMounted.current = true;
  }, [stats]);

  // -------------------------------------------------------------------------
  // График → PNG
  // -------------------------------------------------------------------------
  const captureCharts = useCallback(async (): Promise<DocxCharts> => {
    const result: DocxCharts = {};
    const entries: [keyof DocxCharts, string][] = [
      ['prePost', CHART_IDS.prePost],
      ['studentGain', CHART_IDS.studentGain],
      ['itemCorrect', CHART_IDS.itemCorrect],
      ['categoryShare', CHART_IDS.categoryShare],
    ];

    for (const [key, elementId] of entries) {
      const element = document.getElementById(elementId);
      if (!element) continue;
      try {
        result[key] = await toPng(element, {
          // Даалгаврын шаардлага: 1200×700 px, 2x scale
          pixelRatio: 2,
          width: CHART_WIDTH,
          height: CHART_HEIGHT,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });
      } catch (cause) {
        console.warn(`[report] "${elementId}" графикийг PNG болгож чадсангүй:`, cause);
      }
    }
    return result;
  }, []);

  // -------------------------------------------------------------------------
  // Тайлан үүсгэх
  // -------------------------------------------------------------------------
  const generate = useCallback(async (): Promise<Blob | null> => {
    if (!exam || !stats) return null;
    setGenerating(true);
    try {
      // Recharts зурагдаж дуусахыг хүлээнэ
      await new Promise((resolve) => setTimeout(resolve, 400));
      const charts = await captureCharts();
      const blob = await buildReportDocx(exam, stats, charts);
      setDocxBlob(blob);

      const id = localReportId ?? `rep_${shortId(14)}`;
      setLocalReportId(id);
      await db.reports.put({
        id,
        examId: exam.id,
        generatedAt: new Date().toISOString(),
        stats,
        docxBlob: blob,
        emailStatus: 'pending',
      });

      return blob;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
      return null;
    } finally {
      setGenerating(false);
    }
  }, [captureCharts, exam, localReportId, stats, t, toast]);

  const downloadDocx = async () => {
    if (!exam) return;
    const blob = docxBlob ?? (await generate());
    if (!blob) return;
    downloadBlob(blob, `${safeFileName(exam.title, 'tailan')}-tailan.docx`);
  };

  // -------------------------------------------------------------------------
  // Имэйлээр илгээх
  // -------------------------------------------------------------------------
  const sendEmail = async () => {
    if (!exam || !stats) return;
    setSending(true);
    setEmailError(null);

    try {
      const blob = docxBlob ?? (await generate());
      if (!blob) return;

      const reportId = localReportId ?? `rep_${shortId(14)}`;
      setLocalReportId(reportId);

      // Офлайн бол дараалалд оруулна — sync engine дараа нь илгээнэ
      if (!online || !token) {
        await db.emailQueue.put({
          id: `eq_${shortId(14)}`,
          localReportId: reportId,
          reportId: '',
          examId: exam.id,
          to: exam.teacherEmail,
          createdAt: new Date().toISOString(),
          attempts: 0,
          status: 'pending',
        });
        setEmailStatus('pending');
        void syncEngine.refreshPending();
        toast.warning(t('report.queuedOffline'));
        downloadBlob(blob, `${safeFileName(exam.title, 'tailan')}-tailan.docx`);
        return;
      }

      // Онлайн — шууд байршуулж илгээнэ
      const uploaded = await api.uploadReport(exam.id, token, stats, blob, true);
      await db.reports.update(reportId, {
        serverId: uploaded.report.id,
        emailStatus: uploaded.email?.status === 'sent' ? 'sent' : 'failed',
      });

      if (uploaded.email?.status === 'sent') {
        setEmailStatus('sent');
        toast.success(t('report.sent'));
      } else {
        setEmailStatus('failed');
        setEmailError(uploaded.email?.error ?? null);
        toast.error(uploaded.email?.error ?? t('report.failed'));
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.isOffline
            ? t('error.offlineAction')
            : cause.message
          : t('common.unknownError');
      setEmailStatus('failed');
      setEmailError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  // -------------------------------------------------------------------------
  // Төлөв
  // -------------------------------------------------------------------------
  if (loading || loadingData) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (error || !exam || !stats) {
    return (
      <AppLayout>
        <ErrorState
          title={t('error.examNotFound')}
          action={
            <Button asChild>
              <Link to="/">{t('nav.home')}</Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  if (stats.nPre === 0 && stats.nPost === 0) {
    return (
      <AppLayout title={t('report.title')} subtitle={exam.title}>
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden="true" />}
          title={t('report.noData')}
          action={
            <Button asChild>
              <Link to={`/teacher/${exam.id}${token ? `?t=${encodeURIComponent(token)}` : ''}`}>
                {t('teacher.dashboard')}
              </Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={t('report.title')}
      subtitle={`${exam.title} · ${exam.subject}`}
      wide
      actions={
        <Button asChild variant="ghost" className="text-white hover:bg-white/15">
          <Link to={`/teacher/${exam.id}${token ? `?t=${encodeURIComponent(token)}` : ''}`}>
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('teacher.dashboard')}</span>
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        {stats.lowSampleWarning && <Alert tone="warning">{t('report.lowSample')}</Alert>}

        {/* KPI */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label={t('stats.mean')}
            value={`${formatPercent(stats.pre?.mean ?? null)} → ${formatPercent(stats.post?.mean ?? null)}`}
          />
          <Kpi label={t('stats.meanAbsGain')} value={formatSigned(stats.meanAbsGain)} />
          <Kpi label={t('stats.hakeGain')} value={formatNumber(stats.hakeGain, 3)} />
          <Kpi
            label={t('stats.passRate')}
            value={`${formatPercent(stats.pre?.passRate ?? null)} → ${formatPercent(stats.post?.passRate ?? null)}`}
          />
          <Kpi
            label={t('stats.cohenD')}
            value={
              stats.cohenD === null
                ? '—'
                : `${formatNumber(stats.cohenD)} (${effectSizeLabel(stats.cohenD)})`
            }
          />
          <Kpi
            label={t('stats.pValue')}
            value={
              stats.pValue === null
                ? '—'
                : `${stats.pValue < 0.0001 ? '<0.0001' : stats.pValue.toFixed(4)}`
            }
            hint={
              stats.pValue === null
                ? undefined
                : stats.pValue < 0.05
                  ? t('stats.significant')
                  : t('stats.notSignificant')
            }
          />
        </div>

        {/* Ангилал */}
        <Card>
          <CardHeader>
            <CardTitle>{t('chart.categoryShare')}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(stats.categoryCounts) as (keyof typeof stats.categoryCounts)[]).map(
                (key) => (
                  <Badge
                    key={key}
                    tone={
                      key === 'high' || key === 'medium'
                        ? 'success'
                        : key === 'declined'
                          ? 'danger'
                          : key === 'low'
                            ? 'warning'
                            : 'neutral'
                    }
                    className="px-3 py-1.5"
                  >
                    {CATEGORY_LABELS_MN[key]}: {stats.categoryCounts[key]}
                  </Badge>
                ),
              )}
            </div>
          </CardBody>
        </Card>

        {/* Дүгнэлт */}
        <Card>
          <CardHeader>
            <CardTitle>{t('report.title')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-slate-700">
            <p>{stats.conclusions.overall}</p>
            <p>{stats.conclusions.bestTopic}</p>
            <p>{stats.conclusions.weakTopic}</p>
            <p>{stats.conclusions.attentionStudents}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              {stats.conclusions.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ol>
          </CardBody>
        </Card>

        {/* Сурагчийн хүснэгт */}
        <Card>
          <CardHeader>
            <CardTitle>{t('teacher.submissions')}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">{t('student.lastName')}</th>
                    <th className="py-2 pr-3">{t('student.firstName')}</th>
                    <th className="py-2 pr-3">{t('student.className')}</th>
                    <th className="py-2 pr-3 text-right">{t('teacher.stats.pre')}</th>
                    <th className="py-2 pr-3 text-right">{t('teacher.stats.post')}</th>
                    <th className="py-2 pr-3 text-right">{t('result.gain')}</th>
                    <th className="py-2 pr-3 text-right">⟨g⟩</th>
                    <th className="py-2 pr-3">{t('category.high')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.students.map((student) => (
                    <tr
                      key={student.studentKey}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium text-slate-900">{student.lastName}</td>
                      <td className="py-2 pr-3">{student.firstName}</td>
                      <td className="py-2 pr-3">{student.className}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatPercent(student.prePercent)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatPercent(student.postPercent)}
                      </td>
                      <td
                        className={
                          (student.absGain ?? 0) > 0
                            ? 'py-2 pr-3 text-right font-medium tabular-nums text-success'
                            : (student.absGain ?? 0) < 0
                              ? 'py-2 pr-3 text-right font-medium tabular-nums text-danger'
                              : 'py-2 pr-3 text-right tabular-nums text-slate-600'
                        }
                      >
                        {formatSigned(student.absGain)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatNumber(student.normGain, 3)}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          tone={
                            student.category === 'high' || student.category === 'medium'
                              ? 'success'
                              : student.category === 'declined'
                                ? 'danger'
                                : student.category === 'low'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {CATEGORY_LABELS_MN[student.category]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Үйлдлүүд */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => void downloadDocx()} disabled={generating}>
              {generating ? (
                <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-5 w-5" aria-hidden="true" />
              )}
              {generating ? t('report.generating') : t('report.downloadDocx')}
            </Button>

            <Button
              size="lg"
              variant="secondary"
              onClick={() => void sendEmail()}
              disabled={sending || generating}
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              {sending ? t('report.sending') : t('report.sendEmail')}
            </Button>

            {emailStatus !== 'idle' && (
              <Badge
                tone={
                  emailStatus === 'sent'
                    ? 'success'
                    : emailStatus === 'failed'
                      ? 'danger'
                      : 'warning'
                }
              >
                {t(`report.${emailStatus}`)}
              </Badge>
            )}

            <p className="w-full text-xs text-slate-500">
              {t('report.emailTo', { email: exam.teacherEmail })}
            </p>

            {emailError && (
              <Alert tone="danger">
                {emailError}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => void sendEmail()}>
                    {t('report.resend')}
                  </Button>
                </div>
              </Alert>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Графикууд — дэлгэцээс нуугдсан, PNG авахад ашиглагдана */}
      <ReportCharts stats={stats} labels={chartLabels} />
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
