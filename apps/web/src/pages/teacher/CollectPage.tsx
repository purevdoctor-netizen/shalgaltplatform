/**
 * Багшийн "Хариулт цуглуулах" дэлгэц (`offlineQr` горим).
 *
 * • Камераар хариулт-QR уншина (хэсэглэсэн бол хуримтлуулж нэгтгэнэ)
 * • Давхардлыг `studentKey + mode`-оор шүүнэ
 * • QR уншигдахгүй бол 6 оронтой нөөц кодыг гараар оруулна
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, LayoutDashboard, XCircle } from 'lucide-react';
import type { AnswerValue, Submission } from '@shalgalt/shared';
import {
  canUseManualCode,
  computeStudentKey,
  decodeAnswerQrChunks,
  decodeManualCode,
  parseAnswerQr,
  scoreAnswers,
  type AnswerQrPayload,
  type QrChunk,
} from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import { QrScanner } from '../../components/qr/QrScanner';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { useTeacherExam } from '../../lib/useTeacherExam';
import { saveSubmissionLocally } from '../../db';
import { getDeviceId } from '../../db/device';
import { syncEngine } from '../../sync/engine';
import { formatPercent, shortId } from '../../lib/utils';

interface CollectedRow {
  id: string;
  name: string;
  className: string;
  percent: number;
  status: 'ok' | 'duplicate' | 'error';
  message?: string;
}

export default function CollectPage() {
  const t = useT();
  const toast = useToast();
  const { exam, token, loading, error } = useTeacherExam();

  const [rows, setRows] = useState<CollectedRow[]>([]);
  const [chunkProgress, setChunkProgress] = useState<{ received: number; total: number } | null>(
    null,
  );

  // Хэсэглэсэн QR-ыг санах ойд хуримтлуулна (нэг сурагчийн уншилт богино)
  const chunkBuffer = useRef<Map<string, QrChunk[]>>(new Map());
  // Ижил QR-ыг дараалан уншихаас сэргийлнэ
  const lastScan = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  // Аль хэдийн хүлээж авсан сурагчид
  const accepted = useRef<Set<string>>(new Set());

  // --- Гараар код оруулах ---
  const [manualLastName, setManualLastName] = useState('');
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualClassName, setManualClassName] = useState('');
  const [manualCode, setManualCode] = useState('');

  const manualAvailable = useMemo(() => (exam ? canUseManualCode(exam.questions) : false), [exam]);

  // -------------------------------------------------------------------------
  // Илгээлт хадгалах
  // -------------------------------------------------------------------------
  const record = useCallback(
    async (input: {
      lastName: string;
      firstName: string;
      className: string;
      mode: 'pre' | 'post';
      answers: { questionId: string; value: AnswerValue }[];
      startedAt?: string;
      submittedAt?: string;
      source: 'answerQr' | 'manualCode';
    }): Promise<CollectedRow> => {
      if (!exam) throw new Error('exam');

      const studentKey = computeStudentKey(input.lastName, input.firstName, input.className);
      const dedupeKey = `${studentKey}:${input.mode}`;
      const name = `${input.lastName} ${input.firstName}`;

      if (accepted.current.has(dedupeKey)) {
        return {
          id: shortId(8),
          name,
          className: input.className,
          percent: 0,
          status: 'duplicate',
          message: t('collect.duplicate', { name }),
        };
      }

      const scored = scoreAnswers(exam.questions, input.answers, exam.passThreshold);
      const now = new Date().toISOString();
      const startedAt = input.startedAt ?? now;
      const submittedAt = input.submittedAt ?? now;
      const durationSec = Math.max(
        0,
        Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000),
      );

      const submission: Submission = {
        id: `col_${shortId(14)}`,
        examId: exam.id,
        mode: input.mode,
        studentKey,
        lastName: input.lastName.trim(),
        firstName: input.firstName.trim(),
        className: input.className.trim(),
        answers: input.answers,
        score: scored.score,
        maxScore: scored.maxScore,
        percent: scored.percent,
        passed: scored.passed,
        startedAt,
        submittedAt,
        durationSec,
        deviceId: await getDeviceId(),
        source: input.source,
        syncStatus: 'pending',
      };

      await saveSubmissionLocally(submission, 'pending');
      accepted.current.add(dedupeKey);
      void syncEngine.refreshPending();

      return {
        id: submission.id,
        name,
        className: submission.className,
        percent: submission.percent,
        status: 'ok',
        message: t('collect.accepted', { name, percent: formatPercent(submission.percent, 0) }),
      };
    },
    [exam, t],
  );

  // -------------------------------------------------------------------------
  // QR уншилт
  // -------------------------------------------------------------------------
  const handleScan = useCallback(
    (text: string) => {
      const now = Date.now();
      if (text === lastScan.current.text && now - lastScan.current.at < 2500) return;
      lastScan.current = { text, at: now };

      const scan = parseAnswerQr(text);
      if (!scan) {
        toast.error(t('collect.invalid'));
        return;
      }

      const finish = (payload: AnswerQrPayload) => {
        if (!exam) return;
        if (payload.e !== exam.id) {
          toast.error(t('collect.invalid'));
          return;
        }

        // `a` нь [асуултын дараалал, утга] хосуудын жагсаалт
        const byOrder = new Map(exam.questions.map((question) => [question.order, question.id]));
        const answers = payload.a
          .map(([order, value]) => {
            const questionId = byOrder.get(order);
            return questionId ? { questionId, value } : null;
          })
          .filter((item): item is { questionId: string; value: AnswerValue } => item !== null);

        void record({
          lastName: payload.ln,
          firstName: payload.fn,
          className: payload.cl,
          mode: payload.m,
          answers,
          submittedAt: payload.t,
          source: 'answerQr',
        }).then((row) => {
          setRows((current) => [row, ...current]);
          if (row.status === 'ok') toast.success(row.message ?? '');
          else toast.warning(row.message ?? '');
        });
      };

      if (scan.kind === 'full') {
        setChunkProgress(null);
        finish(scan.payload);
        return;
      }

      // Хэсэглэсэн QR
      const { chunk } = scan;
      const stored = chunkBuffer.current.get(chunk.id) ?? [];
      if (!stored.some((item) => item.i === chunk.i)) stored.push(chunk);
      chunkBuffer.current.set(chunk.id, stored);
      setChunkProgress({ received: stored.length, total: chunk.n });

      if (stored.length === chunk.n) {
        try {
          const payload = decodeAnswerQrChunks(stored);
          chunkBuffer.current.delete(chunk.id);
          setChunkProgress(null);
          finish(payload);
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : t('collect.invalid'));
        }
      }
    },
    [exam, record, t, toast],
  );

  // -------------------------------------------------------------------------
  // Гараар код оруулах
  // -------------------------------------------------------------------------
  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    if (!exam) return;

    const decoded = decodeManualCode(exam.questions, manualCode);
    if (!decoded) {
      toast.error(t('collect.invalid'));
      return;
    }

    void record({
      lastName: manualLastName,
      firstName: manualFirstName,
      className: manualClassName,
      mode: exam.mode,
      answers: decoded,
      source: 'manualCode',
    }).then((row) => {
      setRows((current) => [row, ...current]);
      if (row.status === 'ok') {
        toast.success(row.message ?? '');
        setManualLastName('');
        setManualFirstName('');
        setManualCode('');
      } else {
        toast.warning(row.message ?? '');
      }
    });
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
          action={
            <Button asChild>
              <Link to="/">{t('nav.home')}</Link>
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const okCount = rows.filter((row) => row.status === 'ok').length;

  return (
    <AppLayout
      title={t('collect.title')}
      subtitle={`${exam.title} · ${exam.mode === 'pre' ? t('exam.mode.pre') : t('exam.mode.post')}`}
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
        <div className="flex items-center gap-2">
          <Badge tone="primary" className="px-3 py-1.5 text-sm">
            {t('collect.collected', { count: okCount })}
          </Badge>
          {chunkProgress && (
            <Badge tone="warning">
              {t('collect.chunkProgress', {
                received: chunkProgress.received,
                total: chunkProgress.total,
              })}
            </Badge>
          )}
        </div>

        <Card>
          <CardBody>
            <Tabs defaultValue="scan">
              <TabsList>
                <TabsTrigger value="scan">{t('collect.scanTab')}</TabsTrigger>
                <TabsTrigger value="code">{t('collect.codeTab')}</TabsTrigger>
              </TabsList>

              <TabsContent value="scan">
                <QrScanner onScan={handleScan} />
              </TabsContent>

              <TabsContent value="code">
                {!manualAvailable ? (
                  <Alert tone="warning">{t('collect.manualCodeHint')}</Alert>
                ) : (
                  <form onSubmit={submitManual} className="space-y-3">
                    <p className="text-sm text-slate-600">{t('collect.manualName')}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="m-last" required>
                          {t('student.lastName')}
                        </Label>
                        <Input
                          id="m-last"
                          value={manualLastName}
                          onChange={(event) => setManualLastName(event.target.value)}
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <Label htmlFor="m-first" required>
                          {t('student.firstName')}
                        </Label>
                        <Input
                          id="m-first"
                          value={manualFirstName}
                          onChange={(event) => setManualFirstName(event.target.value)}
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <Label htmlFor="m-class" required>
                          {t('student.className')}
                        </Label>
                        <Input
                          id="m-class"
                          value={manualClassName}
                          onChange={(event) => setManualClassName(event.target.value)}
                          maxLength={50}
                          placeholder={t('student.classPlaceholder')}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="m-code" required>
                        {t('collect.manualCode')}
                      </Label>
                      <Input
                        id="m-code"
                        value={manualCode}
                        onChange={(event) => setManualCode(event.target.value.toUpperCase())}
                        maxLength={6}
                        className="text-center font-mono text-2xl tracking-[0.4em]"
                        placeholder="A1B2C3"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>

                    <Button
                      type="submit"
                      block
                      disabled={
                        manualCode.length !== 6 ||
                        manualLastName.trim() === '' ||
                        manualFirstName.trim() === '' ||
                        manualClassName.trim() === ''
                      }
                    >
                      {t('collect.manualSubmit')}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardBody>
        </Card>

        {/* Цуглуулсан жагсаалт */}
        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('teacher.submissions')}</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5">
                    {row.status === 'ok' ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{row.name}</p>
                      <p className="truncate text-sm text-slate-500">{row.className}</p>
                    </div>
                    {row.status === 'ok' && (
                      <Badge tone="primary">{formatPercent(row.percent, 0)}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
