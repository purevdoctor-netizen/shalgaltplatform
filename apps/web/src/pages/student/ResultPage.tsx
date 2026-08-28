/**
 * Сурагчийн дүнгийн дэлгэц.
 *
 * • Оноо, хувь, тэнцсэн эсэх
 * • `showAnswersToStudent` бол асуулт бүрийн зөв/буруу
 * • ДАРААХ горимд өмнөх дүнтэй харьцуулсан ахиц
 * • `offlineQr` горимд хариулт-QR + 6 оронтой нөөц код
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, XCircle } from 'lucide-react';
import type { AnswerValue, Question, Submission } from '@shalgalt/shared';
import {
  buildAnswerQrSlides,
  canUseManualCode,
  encodeManualCode,
  isAnswered,
  isCorrect,
  FALSE_OPTION_ID,
  TRUE_OPTION_ID,
  type AnswerQrPayload,
} from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import { QrCanvas } from '../../components/qr/QrCanvas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  Progress,
} from '../../components/ui';
import { useT } from '../../i18n';
import { useStudentExam } from '../../lib/useStudentExam';
import { findLocalSubmission, saveSubmissionLocally } from '../../db';
import { api } from '../../lib/api';
import { config } from '../../config';
import { cn, formatDuration, formatPercent, formatSigned } from '../../lib/utils';

export default function ResultPage() {
  const t = useT();
  const [searchParams] = useSearchParams();
  const studentKey = searchParams.get('k') ?? '';
  const { exam, loading, error } = useStudentExam();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [preSubmission, setPreSubmission] = useState<Submission | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [answerSlides, setAnswerSlides] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Дүн ачаалах
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam || studentKey === '') return;
    let cancelled = false;

    void (async () => {
      const current = await findLocalSubmission(exam.id, exam.mode, studentKey);
      if (cancelled) return;
      setSubmission(current ?? null);

      // Локал дүн хуучин/серверт оноологдоогүй байж болох тул онлайн үед
      // серверийн эцсийн оноогоор нөхөн шинэчилнэ.
      if (exam.deliveryMode !== 'offlineQr') {
        try {
          const response = await api.mySubmissions(exam.id, studentKey, exam.mode);
          const serverSubmission = response.submissions[0];
          if (serverSubmission && !cancelled) {
            setSubmission(serverSubmission);
            await saveSubmissionLocally(serverSubmission, 'synced');
          }
        } catch {
          // Сүлжээгүй үед локал дүнг харуулна.
        }
      }

      // ДАРААХ горимд өмнөх дүнг олно: эхлээд локал, дараа нь сервер
      if (exam.mode === 'post') {
        const localPre = await findLocalSubmission(exam.id, 'pre', studentKey);
        if (cancelled) return;
        if (localPre) {
          setPreSubmission(localPre);
        } else if (exam.deliveryMode !== 'offlineQr') {
          try {
            const response = await api.mySubmissions(exam.id, studentKey, 'pre');
            if (!cancelled) setPreSubmission(response.submissions[0] ?? null);
          } catch {
            // Офлайн — өмнөх дүнгүйгээр л харуулна
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exam, studentKey]);

  // -------------------------------------------------------------------------
  // Хариулт-QR (зөвхөн offlineQr горимд)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam || !submission || exam.deliveryMode !== 'offlineQr') return;

    const byId = new Map(exam.questions.map((question) => [question.id, question.order]));
    const payload: AnswerQrPayload = {
      v: 1,
      e: exam.id,
      m: exam.mode,
      k: submission.studentKey,
      ln: submission.lastName,
      fn: submission.firstName,
      cl: submission.className,
      // Асуултын id-ийн оронд `order`-ыг явуулна — QR богино болно
      a: submission.answers
        .map((answer): [number, AnswerValue] | null => {
          const order = byId.get(answer.questionId);
          return order === undefined ? null : [order, answer.value];
        })
        .filter((entry): entry is [number, AnswerValue] => entry !== null),
      t: submission.submittedAt,
    };

    try {
      setAnswerSlides(
        buildAnswerQrSlides(payload, {
          chunkId: submission.id.slice(-6),
          maxBytes: config.qrMaxBytes,
        }),
      );
    } catch {
      setAnswerSlides([]);
    }

    if (canUseManualCode(exam.questions)) {
      const map = new Map<string, AnswerValue>(
        submission.answers.map((answer) => [answer.questionId, answer.value]),
      );
      setManualCode(encodeManualCode(exam.questions, map));
    }
  }, [exam, submission]);

  // Хэсэглэсэн хариулт-QR автоматаар солигдоно
  useEffect(() => {
    if (answerSlides.length <= 1) return;
    const timer = setInterval(() => {
      setSlideIndex((current) => (current + 1) % answerSlides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [answerSlides.length]);

  const gain = useMemo(() => {
    if (!submission || !preSubmission) return null;
    return Math.round((submission.percent - preSubmission.percent) * 100) / 100;
  }, [submission, preSubmission]);

  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (error || !exam || !submission) {
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

  return (
    <AppLayout title={t('result.title')} subtitle={exam.title}>
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Гол дүн */}
        <Card>
          <CardBody className="text-center">
            <p className="text-sm text-slate-500">
              {submission.lastName} {submission.firstName} · {submission.className}
            </p>

            <p
              className={cn(
                'mt-3 text-6xl font-extrabold tabular-nums',
                submission.passed ? 'text-success' : 'text-danger',
              )}
            >
              {formatPercent(submission.percent, 0)}
            </p>

            <p className="mt-1 text-slate-600">
              {submission.score} / {submission.maxScore} {t('common.points')}
            </p>

            <div className="mt-3">
              <Badge
                tone={submission.passed ? 'success' : 'danger'}
                className="px-4 py-1.5 text-sm"
              >
                {submission.passed ? t('result.passed') : t('result.failed')}
              </Badge>
            </div>

            <Progress value={submission.percent} className="mt-4" label={t('result.percent')} />

            <p className="mt-3 text-xs text-slate-500">
              {t('result.duration')}: {formatDuration(submission.durationSec)}
            </p>
          </CardBody>
        </Card>

        {/* Ахиц */}
        {exam.mode === 'post' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('result.gain')}</CardTitle>
            </CardHeader>
            <CardBody>
              {preSubmission && gain !== null ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {t('result.preScore')}
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-slate-700">
                      {formatPercent(preSubmission.percent, 0)}
                    </p>
                  </div>

                  <ArrowRight className="h-5 w-5 text-slate-300" aria-hidden="true" />

                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {t('result.postScore')}
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-primary">
                      {formatPercent(submission.percent, 0)}
                    </p>
                  </div>

                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-2xl px-3 py-2 text-lg font-bold tabular-nums',
                      gain > 0
                        ? 'bg-success-50 text-success-700'
                        : gain < 0
                          ? 'bg-danger-50 text-danger-700'
                          : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {gain > 0 ? (
                      <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                    ) : gain < 0 ? (
                      <ArrowDownRight className="h-5 w-5" aria-hidden="true" />
                    ) : null}
                    {formatSigned(gain)}
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">{t('category.postOnly')}</p>
              )}
            </CardBody>
          </Card>
        )}

        {/* Асуулт бүрийн задаргаа */}
        {exam.showAnswersToStudent && (
          <Card>
            <CardHeader>
              <CardTitle>{t('question.title')}</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-3">
                {exam.questions
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((question) => {
                    const answer =
                      submission.answers.find((item) => item.questionId === question.id)?.value ??
                      null;
                    const correct = isCorrect(question, answer);
                    return (
                      <li
                        key={question.id}
                        className={cn(
                          'rounded-2xl border p-3',
                          correct
                            ? 'border-success-100 bg-success-50'
                            : 'border-danger-100 bg-danger-50',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {correct ? (
                            <CheckCircle2
                              className="mt-0.5 h-5 w-5 shrink-0 text-success"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle
                              className="mt-0.5 h-5 w-5 shrink-0 text-danger"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">
                              {question.order}. {question.text}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {t('result.yourAnswer')}:{' '}
                              <span className="font-medium">
                                {formatAnswer(question, answer, t)}
                              </span>
                            </p>
                            {!correct && (
                              <p className="mt-0.5 text-sm text-success-700">
                                {t('result.correctAnswer')}:{' '}
                                <span className="font-medium">
                                  {formatCorrectAnswer(question, t)}
                                </span>
                              </p>
                            )}
                          </div>
                          <Badge tone={correct ? 'success' : 'danger'}>
                            {correct ? question.points : 0}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
              </ol>
            </CardBody>
          </Card>
        )}

        {/* Хариулт-QR (offlineQr) */}
        {exam.deliveryMode === 'offlineQr' && answerSlides.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('result.answerQr')}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col items-center gap-3">
              <Alert tone="primary">{t('result.answerQrHint')}</Alert>

              <QrCanvas
                value={answerSlides[slideIndex] ?? ''}
                size={280}
                alt={t('result.answerQr')}
              />

              {answerSlides.length > 1 && (
                <Badge tone="primary">
                  {t('qr.slide', { current: slideIndex + 1, total: answerSlides.length })}
                </Badge>
              )}

              {manualCode && (
                <div className="w-full rounded-2xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {t('result.manualCode')}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">
                    {manualCode}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{t('result.manualCodeHint')}</p>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        <div className="pb-4 text-center">
          <p className="mb-3 text-lg font-medium text-slate-700">{t('result.done')}</p>
        </div>
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------

function formatAnswer(question: Question, value: AnswerValue, t: (key: string) => string): string {
  if (!isAnswered(value)) return t('result.noAnswer');

  if (question.type === 'truefalse') {
    return value === true ? t('question.true') : t('question.false');
  }

  const label = (id: string) => {
    const option = question.options?.find((item) => item.id === id);
    return option ? `${id}. ${option.text}` : id;
  };

  if (Array.isArray(value)) return value.map(label).join(', ');
  if (typeof value === 'string') {
    return question.type === 'short' ? value : label(value);
  }
  return String(value);
}

function formatCorrectAnswer(question: Question, t: (key: string) => string): string {
  if (question.type === 'short') return (question.acceptedAnswers ?? []).join(' / ');

  const ids = question.correctOptionIds ?? [];
  if (question.type === 'truefalse') {
    return ids[0] === TRUE_OPTION_ID
      ? t('question.true')
      : ids[0] === FALSE_OPTION_ID
        ? t('question.false')
        : '—';
  }

  return ids
    .map((id) => {
      const option = question.options?.find((item) => item.id === id);
      return option ? `${id}. ${option.text}` : id;
    })
    .join(', ');
}
