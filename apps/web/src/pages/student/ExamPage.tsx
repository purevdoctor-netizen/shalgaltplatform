/**
 * Сурагчийн шалгалтын дэлгэц.
 *
 * • `onePerPage` тохиргоогоор "нэг асуулт нэг дэлгэц" эсвэл "бүгд нэг хуудсанд"
 * • Прогресс бар, таймер
 * • Хариулт өөрчлөгдөх бүрд IndexedDB-д ноорог хадгалагдана (хуудас дахин
 *   ачаалахад үргэлжилнэ)
 * • Хугацаа дуусахад одоогийн хариултууд АВТОМАТААР илгээгдэнэ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Send } from 'lucide-react';
import type { AnswerValue, Question, Submission } from '@shalgalt/shared';
import { orderQuestionsFor, scoreAnswers, isAnswered } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Dialog,
  ErrorState,
  LoadingState,
  Progress,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { useStudentExam } from '../../lib/useStudentExam';
import {
  deleteDraft,
  draftId,
  findLocalSubmission,
  getDraft,
  getSetting,
  saveDraft,
  saveSubmissionLocally,
} from '../../db';
import { getDeviceId } from '../../db/device';
import { api, ApiError } from '../../lib/api';
import { syncEngine } from '../../sync/engine';
import { cn, formatDuration, shortId } from '../../lib/utils';
import { QuestionInput } from '../../components/exam/QuestionInput';

interface StoredIdentity {
  lastName: string;
  firstName: string;
  className: string;
}

const IDENTITY_KEY = 'studentIdentity';

export default function ExamPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studentKey = searchParams.get('k') ?? '';

  const { exam, loading, error } = useStudentExam();

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString());
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const submittedRef = useRef(false);
  const identity = useRef<{ lastName: string; firstName: string; className: string } | null>(null);

  // -------------------------------------------------------------------------
  // Асуултын дараалал (shuffle бол сурагч тус бүрд тогтвортой)
  // -------------------------------------------------------------------------
  const questions: Question[] = useMemo(
    () => (exam ? orderQuestionsFor(exam, studentKey) : []),
    [exam, studentKey],
  );

  // -------------------------------------------------------------------------
  // Ноорог сэргээх
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam || studentKey === '') return;
    let cancelled = false;

    void (async () => {
      const storedIdentity = await getSetting<StoredIdentity | null>(IDENTITY_KEY, null);
      if (storedIdentity) identity.current = storedIdentity;

      // Аль хэдийн өгсөн бол шууд дүн рүү
      const existing = await findLocalSubmission(exam.id, exam.mode, studentKey);
      if (existing && !cancelled) {
        navigate(`/exam/${exam.id}/result?k=${studentKey}`, { replace: true });
        return;
      }

      const draft = await getDraft(exam.id, exam.mode, studentKey);
      if (cancelled) return;

      if (draft) {
        identity.current = {
          lastName: draft.lastName,
          firstName: draft.firstName,
          className: draft.className,
        };
        setAnswers(draft.answers);
        setIndex(Math.min(draft.currentIndex, Math.max(0, questions.length - 1)));
        setStartedAt(draft.startedAt);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, studentKey]);

  // -------------------------------------------------------------------------
  // Таймер
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!exam?.durationMin || !ready) return;

    const deadline = new Date(startedAt).getTime() + exam.durationMin * 60_000;
    const tick = () => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0 && !submittedRef.current) {
        void submit(true);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, startedAt, ready]);

  // -------------------------------------------------------------------------
  // Ноорог хадгалах (хариулт солигдох бүрд)
  // -------------------------------------------------------------------------
  const persistDraft = useCallback(
    (nextAnswers: Record<string, AnswerValue>, nextIndex: number) => {
      if (!exam || studentKey === '') return;
      const person = identity.current;
      void saveDraft({
        id: draftId(exam.id, exam.mode, studentKey),
        examId: exam.id,
        mode: exam.mode,
        studentKey,
        lastName: person?.lastName ?? '',
        firstName: person?.firstName ?? '',
        className: person?.className ?? '',
        answers: nextAnswers,
        questionOrder: questions.map((question) => question.id),
        startedAt,
        updatedAt: new Date().toISOString(),
        currentIndex: nextIndex,
      });
    },
    [exam, questions, startedAt, studentKey],
  );

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((current) => {
      const next = { ...current, [questionId]: value };
      persistDraft(next, index);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Илгээх
  // -------------------------------------------------------------------------
  const submit = useCallback(
    async (auto = false) => {
      if (!exam || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      const payloadAnswers = questions.map((question) => ({
        questionId: question.id,
        value: answers[question.id] ?? null,
      }));

      const scored = scoreAnswers(exam.questions, payloadAnswers, exam.passThreshold);
      const submittedAt = new Date().toISOString();
      const durationSec = Math.max(
        0,
        Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000),
      );
      const person = identity.current;

      const submission: Submission = {
        id: `sub_${shortId(14)}`,
        examId: exam.id,
        mode: exam.mode,
        studentKey,
        lastName: person?.lastName ?? '',
        firstName: person?.firstName ?? '',
        className: person?.className ?? '',
        answers: payloadAnswers,
        score: scored.score,
        maxScore: scored.maxScore,
        percent: scored.percent,
        passed: scored.passed,
        startedAt,
        submittedAt,
        durationSec,
        deviceId: await getDeviceId(),
        source: exam.deliveryMode === 'lan' ? 'lan' : 'online',
        syncStatus: 'pending',
      };

      // 1. Эхлээд ЛОКАЛД хадгална — сүлжээ байхгүй ч алдагдахгүй
      await saveSubmissionLocally(submission, 'pending');
      await deleteDraft(exam.id, exam.mode, studentKey);

      // 2. offlineQr горимд сервер байхгүй тул хадгалаад л боллоо
      if (exam.deliveryMode !== 'offlineQr') {
        try {
          const response = await api.submit(exam.id, {
            id: submission.id,
            mode: submission.mode,
            lastName: submission.lastName,
            firstName: submission.firstName,
            className: submission.className,
            studentKey: submission.studentKey,
            answers: submission.answers,
            startedAt: submission.startedAt,
            submittedAt: submission.submittedAt,
            durationSec: submission.durationSec,
            deviceId: submission.deviceId,
            source: submission.source,
          });
          await saveSubmissionLocally({ ...response.submission, syncStatus: 'synced' }, 'synced');
        } catch (cause) {
          // Офлайн эсвэл давхардал — sync engine дараа нь оролдоно
          if (cause instanceof ApiError && cause.isConflict) {
            await saveSubmissionLocally({ ...submission, syncStatus: 'synced' }, 'synced');
          }
        }
      }

      void syncEngine.refreshPending();
      if (auto) toast.warning(t('student.timeUp'));
      navigate(`/exam/${exam.id}/result?k=${studentKey}`, { replace: true });
    },
    [answers, exam, navigate, questions, startedAt, studentKey, t, toast],
  );

  // -------------------------------------------------------------------------
  // Төлөв
  // -------------------------------------------------------------------------
  if (loading || !ready) {
    return (
      <AppLayout>
        <LoadingState label={t('common.loading')} />
      </AppLayout>
    );
  }

  if (error || !exam || studentKey === '') {
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

  const answeredCount = questions.filter((question) =>
    isAnswered(answers[question.id] ?? null),
  ).length;
  const unanswered = questions.length - answeredCount;
  const onePerPage = exam.onePerPage;
  const visible = onePerPage ? questions.slice(index, index + 1) : questions;
  const timeWarning = remainingSec !== null && remainingSec <= 60;

  return (
    <AppLayout title={exam.title} subtitle={exam.subject}>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Прогресс + таймер */}
        <div className="sticky top-0 z-20 -mx-4 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="mb-2 flex items-center gap-3">
            <p className="text-sm text-slate-600">
              {t('student.progress', { answered: answeredCount, total: questions.length })}
            </p>
            {remainingSec !== null && (
              <span
                className={cn(
                  'ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums',
                  timeWarning ? 'bg-danger-100 text-danger-700' : 'bg-slate-100 text-slate-700',
                )}
                role="timer"
                aria-live={timeWarning ? 'assertive' : 'off'}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                {formatDuration(Math.max(0, remainingSec))}
              </span>
            )}
          </div>
          <Progress
            value={answeredCount}
            max={questions.length}
            label={t('student.progress', { answered: answeredCount, total: questions.length })}
          />
        </div>

        {/* Асуултууд */}
        <ol className="space-y-4">
          {visible.map((question) => {
            const questionIndex = questions.indexOf(question);
            return (
              <li key={question.id}>
                <Card>
                  <CardBody>
                    <QuestionInput
                      question={question}
                      index={questionIndex}
                      value={answers[question.id] ?? null}
                      onChange={(value) => setAnswer(question.id, value)}
                    />
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>

        {/* Навигаци */}
        {onePerPage ? (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const next = Math.max(0, index - 1);
                setIndex(next);
                persistDraft(answers, next);
              }}
              disabled={index === 0}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t('common.previous')}
            </Button>

            <span className="text-sm text-slate-500">
              {index + 1} {t('common.of')} {questions.length}
            </span>

            {index < questions.length - 1 ? (
              <Button
                className="ml-auto"
                onClick={() => {
                  const next = Math.min(questions.length - 1, index + 1);
                  setIndex(next);
                  persistDraft(answers, next);
                }}
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button className="ml-auto" onClick={() => setConfirmOpen(true)}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {t('common.submit')}
              </Button>
            )}
          </div>
        ) : (
          <Button size="lg" block onClick={() => setConfirmOpen(true)}>
            <Send className="h-5 w-5" aria-hidden="true" />
            {t('common.submit')}
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('student.submitConfirmTitle')}
        description={
          unanswered > 0
            ? t('student.submitConfirmBody', { unanswered })
            : t('student.submitAllAnswered')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submit(false)} disabled={submitting}>
              {submitting ? t('common.saving') : t('common.submit')}
            </Button>
          </>
        }
      >
        {unanswered > 0 && (
          <Alert tone="warning">{t('student.submitConfirmBody', { unanswered })}</Alert>
        )}
      </Dialog>
    </AppLayout>
  );
}
