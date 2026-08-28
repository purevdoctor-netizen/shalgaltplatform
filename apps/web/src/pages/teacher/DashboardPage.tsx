/**
 * Алхам 4 — Багшийн хяналтын самбар: горим солих, ирсэн хариулт, давхардал.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightLeft,
  BarChart3,
  Copy,
  Download,
  QrCode,
  RefreshCw,
  ScanLine,
  Trash2,
  Users,
} from 'lucide-react';
import type { Submission } from '@shalgalt/shared';
import { computeReportStats } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useTeacherExam } from '../../lib/useTeacherExam';
import { listLocalSubmissions } from '../../db';
import { useSyncStatus } from '../../sync/useSync';
import { copyToClipboard, formatDateTime, formatPercent, formatSigned } from '../../lib/utils';

export default function DashboardPage() {
  const t = useT();
  const toast = useToast();
  const { lastSyncAt } = useSyncStatus();
  const { exam, token, loading, error, fromCache, setExam } = useTeacherExam();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [conflicts, setConflicts] = useState<Submission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const manageLink =
    exam && token
      ? `${window.location.origin}/teacher/${exam.id}?t=${encodeURIComponent(token)}`
      : '';

  // -------------------------------------------------------------------------
  // Илгээлт ачаалах — сүлжээнээс, боломжгүй бол локалаас
  // -------------------------------------------------------------------------
  const loadSubmissions = useCallback(async () => {
    if (!exam) return;
    setRefreshing(true);
    try {
      if (token) {
        const response = await api.listSubmissions(exam.id, token);
        const local = await listLocalSubmissions(exam.id);
        const byId = new Map(response.submissions.map((item) => [item.id, item]));
        for (const item of local) byId.set(item.id, byId.get(item.id) ?? item);
        setSubmissions([...byId.values()]);
        setConflicts(response.conflicts);
      } else {
        setSubmissions(await listLocalSubmissions(exam.id));
      }
    } catch {
      // Офлайн — локал хуулбар
      setSubmissions(await listLocalSubmissions(exam.id));
    } finally {
      setRefreshing(false);
    }
  }, [exam, token]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions, lastSyncAt]);

  // -------------------------------------------------------------------------
  // Статистик
  // -------------------------------------------------------------------------
  const pre = useMemo(() => submissions.filter((item) => item.mode === 'pre'), [submissions]);
  const post = useMemo(() => submissions.filter((item) => item.mode === 'post'), [submissions]);

  const stats = useMemo(
    () => (exam ? computeReportStats(exam, pre, post) : null),
    [exam, pre, post],
  );

  // -------------------------------------------------------------------------
  // Горим солих
  // -------------------------------------------------------------------------
  const switchToPost = async () => {
    if (!exam || !token) return;
    setSwitching(true);
    try {
      const response = await api.switchToPost(exam.id, token);
      setExam(response.exam);
      setSwitchOpen(false);
      toast.success(t('teacher.switchDone'));
      await loadSubmissions();
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.isOffline
            ? t('error.offlineAction')
            : cause.message
          : t('common.unknownError'),
      );
    } finally {
      setSwitching(false);
    }
  };

  const deleteConflict = async (submissionId: string) => {
    if (!exam || !token) return;
    try {
      await api.deleteSubmission(exam.id, token, submissionId);
      setConflicts((current) => current.filter((item) => item.id !== submissionId));
      toast.success(t('common.delete'));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('common.unknownError'));
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (error || !exam) {
    return (
      <AppLayout>
        <ErrorState
          title={t('error.examNotFound')}
          message={error === 'network' ? t('error.network') : undefined}
          action={
            <Button asChild>
              <Link to="/">{t('nav.home')}</Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const canManage = token !== null;

  return (
    <AppLayout
      title={exam.title}
      subtitle={`${exam.subject} · ${exam.teacherName}`}
      actions={
        <>
          <Button asChild variant="ghost" className="text-white hover:bg-white/15">
            <Link to={`/teacher/${exam.id}/qr${token ? `?t=${encodeURIComponent(token)}` : ''}`}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('qr.title')}</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" className="text-white hover:bg-white/15">
            <Link
              to={`/teacher/${exam.id}/report${token ? `?t=${encodeURIComponent(token)}` : ''}`}
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('nav.report')}</span>
            </Link>
          </Button>
        </>
      }
      wide
    >
      <div className="space-y-5">
        {fromCache && <Alert tone="warning">{t('online.offline')}</Alert>}

        {!canManage && <Alert tone="danger">{t('error.tokenInvalid')}</Alert>}

        {/* Удирдах линк */}
        {canManage && (
          <Alert tone="primary" title={t('teacher.linkWarning')}>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white/70 px-2 py-1 text-xs">
                {manageLink}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (await copyToClipboard(manageLink)) toast.success(t('common.copied'));
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {t('teacher.copyLink')}
              </Button>
            </div>
          </Alert>
        )}

        {/* Горим + KPI */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('teacher.stats.pre')}
            value={String(stats?.nPre ?? 0)}
            hint={formatPercent(stats?.pre?.mean ?? null)}
            tone={exam.mode === 'pre' ? 'primary' : 'neutral'}
          />
          <StatCard
            label={t('teacher.stats.post')}
            value={String(stats?.nPost ?? 0)}
            hint={formatPercent(stats?.post?.mean ?? null)}
            tone={exam.mode === 'post' ? 'success' : 'neutral'}
          />
          <StatCard label={t('teacher.stats.paired')} value={String(stats?.nPaired ?? 0)} />
          <StatCard
            label={t('teacher.stats.avgGain')}
            value={formatSigned(stats?.meanAbsGain ?? null)}
            tone={
              (stats?.meanAbsGain ?? 0) > 0
                ? 'success'
                : (stats?.meanAbsGain ?? 0) < 0
                  ? 'danger'
                  : 'neutral'
            }
          />
        </div>

        {/* Үйлдлүүд */}
        <div className="flex flex-wrap gap-2">
          {exam.mode === 'pre' ? (
            <Button size="lg" onClick={() => setSwitchOpen(true)} disabled={!canManage}>
              <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
              {t('teacher.switchToPost')}
            </Button>
          ) : (
            <Badge tone="success" className="px-4 py-2 text-sm">
              {t('exam.mode.post')}
            </Badge>
          )}

          {exam.deliveryMode === 'offlineQr' && (
            <Button asChild variant="secondary" size="lg">
              <Link
                to={`/teacher/${exam.id}/collect${token ? `?t=${encodeURIComponent(token)}` : ''}`}
              >
                <ScanLine className="h-5 w-5" aria-hidden="true" />
                {t('teacher.collect')}
              </Link>
            </Button>
          )}

          <Button variant="ghost" onClick={() => void loadSubmissions()} disabled={refreshing}>
            <RefreshCw
              className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              aria-hidden="true"
            />
            {t('common.retry')}
          </Button>

          {canManage && (
            <Button asChild variant="ghost">
              <a href={api.exportCsvUrl(exam.id, token)} download>
                <Download className="h-4 w-4" aria-hidden="true" />
                {t('teacher.exportCsv')}
              </a>
            </Button>
          )}
        </div>

        {/* Хариултууд */}
        <Card>
          <CardHeader>
            <CardTitle>{t('teacher.submissions')}</CardTitle>
          </CardHeader>
          <CardBody>
            <Tabs defaultValue="pre">
              <TabsList>
                <TabsTrigger value="pre">
                  {t('teacher.stats.pre')} ({pre.length})
                </TabsTrigger>
                <TabsTrigger value="post">
                  {t('teacher.stats.post')} ({post.length})
                </TabsTrigger>
                {conflicts.length > 0 && (
                  <TabsTrigger value="conflicts">
                    {t('teacher.conflicts')} ({conflicts.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="pre">
                <SubmissionTable items={pre} threshold={exam.passThreshold} />
              </TabsContent>
              <TabsContent value="post">
                <SubmissionTable items={post} threshold={exam.passThreshold} />
              </TabsContent>
              {conflicts.length > 0 && (
                <TabsContent value="conflicts">
                  <Alert tone="warning">{t('teacher.conflictsHint')}</Alert>
                  <div className="mt-3">
                    <SubmissionTable
                      items={conflicts}
                      threshold={exam.passThreshold}
                      onDelete={canManage ? deleteConflict : undefined}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardBody>
        </Card>
      </div>

      {/* Горим солих баталгаажуулалт */}
      <Dialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        title={t('teacher.switchConfirmTitle')}
        description={t('teacher.switchConfirmBody', { count: pre.length })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSwitchOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void switchToPost()} disabled={switching}>
              {switching ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        {exam.deliveryMode === 'offlineQr' && (
          <Alert tone="warning">{t('delivery.offlineQr.hint')}</Alert>
        )}
      </Dialog>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'primary' | 'success' | 'danger';
}) {
  const tones = {
    neutral: 'text-slate-900',
    primary: 'text-primary',
    success: 'text-success',
    danger: 'text-danger',
  } as const;

  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function SubmissionTable({
  items,
  threshold,
  onDelete,
}: {
  items: Submission[];
  threshold: number;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const t = useT();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" aria-hidden="true" />}
        title={t('teacher.noSubmissions')}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">{t('student.lastName')}</th>
            <th className="py-2 pr-3">{t('student.firstName')}</th>
            <th className="py-2 pr-3">{t('student.className')}</th>
            <th className="py-2 pr-3 text-right">{t('result.score')}</th>
            <th className="py-2 pr-3 text-right">{t('result.percent')}</th>
            <th className="py-2 pr-3">{t('result.passed')}</th>
            <th className="py-2 pr-3">{t('result.duration')}</th>
            {onDelete && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-3 font-medium text-slate-900">{item.lastName}</td>
              <td className="py-2 pr-3">{item.firstName}</td>
              <td className="py-2 pr-3">{item.className}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {item.score} / {item.maxScore}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPercent(item.percent)}</td>
              <td className="py-2 pr-3">
                <Badge tone={item.percent >= threshold ? 'success' : 'danger'}>
                  {item.percent >= threshold ? t('result.passed') : t('result.failed')}
                </Badge>
              </td>
              <td className="py-2 pr-3 text-xs text-slate-500">
                {formatDateTime(item.submittedAt)}
              </td>
              {onDelete && (
                <td className="py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void onDelete(item.id)}
                    aria-label={t('common.delete')}
                    className="text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
