/**
 * Нүүр хуудас.
 *
 * • Нэвтрээгүй үед — зөвхөн "шалгалтад орох" (сурагчийн урсгал) + нэвтрэх урилга
 * • Нэвтэрсэн үед  — шалгалт үүсгэх + миний шалгалтууд (сервер дээрх жагсаалт)
 *
 * Шалгалтын жагсаалт СЕРВЕРЭЭС ирнэ (эзэмшигчээр шүүгдсэн). Сүлжээ тасарсан
 * үед локал хуулбар руу шилжинэ.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FilePlus2, LogIn, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
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
  Input,
  Label,
  LoadingState,
} from '../components/ui';
import { useToast } from '../components/ui/toast';
import { useT } from '../i18n';
import { api, ApiError, type ExamListItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deleteExamLocally, listMyExams } from '../db';
import { formatDate } from '../lib/utils';

export default function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading, isAdmin, offline } = useAuth();

  const [code, setCode] = useState('');
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ExamListItem | null>(null);

  // -------------------------------------------------------------------------
  const loadExams = useCallback(async () => {
    if (!user) {
      setExams([]);
      return;
    }
    setLoadingExams(true);
    try {
      const response = await api.listMyExams();
      setExams(response.exams);
      setFromCache(false);
    } catch {
      // Офлайн — локал хуулбар
      const local = await listMyExams();
      setExams(
        local.map((exam) => ({
          id: exam.id,
          title: exam.title,
          subject: exam.subject,
          examDate: exam.examDate,
          mode: exam.mode,
          status: exam.status,
          deliveryMode: exam.deliveryMode,
          teacherName: exam.teacherName,
          teacherToken: exam.teacherToken,
          ownerId: exam.ownerId ?? null,
          createdAt: exam.createdAt,
          questionCount: exam.questions.length,
          submissionCount: 0,
        })),
      );
      setFromCache(true);
    } finally {
      setLoadingExams(false);
    }
  }, [user]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const join = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed !== '') navigate(`/exam/${encodeURIComponent(trimmed)}`);
  };

  const removeExam = async (exam: ExamListItem) => {
    setConfirmDelete(null);
    try {
      await api.deleteExam(exam.id, exam.teacherToken);
      await deleteExamLocally(exam.id);
      setExams((current) => current.filter((item) => item.id !== exam.id));
      toast.success(t('common.delete'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('common.unknownError'));
    }
  };

  // -------------------------------------------------------------------------
  return (
    <AppLayout title={t('home.title')} subtitle={t('home.subtitle')}>
      <div className="grid gap-5 md:grid-cols-2">
        {/* --- Багш --- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('nav.createExam')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">{t('app.tagline')}</p>

            {authLoading ? (
              <div className="skeleton h-[52px] w-full" />
            ) : user ? (
              <Button asChild size="lg" block>
                <Link to="/create">
                  <FilePlus2 className="h-5 w-5" aria-hidden="true" />
                  {t('home.createExam')}
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" block>
                  <Link to="/login">
                    <LogIn className="h-5 w-5" aria-hidden="true" />
                    {t('auth.login')}
                  </Link>
                </Button>
                <p className="text-xs text-slate-500">{t('auth.forgotPassword')}</p>
              </>
            )}
          </CardBody>
        </Card>

        {/* --- Сурагч --- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('home.joinExam')}</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={join} className="space-y-3">
              <div>
                <Label htmlFor="exam-code">{t('home.enterCode')}</Label>
                <Input
                  id="exam-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="abcdefgh1234"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button type="submit" variant="secondary" block disabled={code.trim() === ''}>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {t('home.joinExam')}
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                {t('qr.scanHint')}
              </p>
            </form>
          </CardBody>
        </Card>
      </div>

      {/* --- Миний шалгалтууд (зөвхөн нэвтэрсэн үед) --- */}
      {user && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {isAdmin ? t('admin.stat.exams') : t('home.myExams')}
              {exams.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">({exams.length})</span>
              )}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadExams()}
              disabled={loadingExams}
              className="ml-auto"
              aria-label={t('common.retry')}
            >
              <RefreshCw
                className={loadingExams ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden="true"
              />
            </Button>
          </div>

          {(fromCache || offline) && <Alert tone="warning">{t('online.offline')}</Alert>}

          {loadingExams && exams.length === 0 ? (
            <LoadingState label={t('common.loading')} />
          ) : exams.length === 0 ? (
            <EmptyState
              icon={<FilePlus2 className="h-10 w-10" aria-hidden="true" />}
              title={t('home.noExams')}
              action={
                <Button asChild>
                  <Link to="/create">{t('home.createExam')}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {exams.map((exam) => (
                <li key={exam.id}>
                  <div className="card flex min-h-touch items-center gap-3 px-4 py-3 transition-colors hover:border-primary-200 hover:bg-primary-50/40">
                    <Link
                      to={`/teacher/${exam.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{exam.title}</p>
                        <p className="truncate text-sm text-slate-500">
                          {exam.subject} · {formatDate(exam.examDate)} · {exam.questionCount}{' '}
                          {t('question.title').toLowerCase()}
                          {exam.submissionCount > 0 && ` · ${exam.submissionCount} ✓`}
                          {isAdmin && ` · ${exam.teacherName}`}
                        </p>
                      </div>
                      <Badge tone={exam.mode === 'pre' ? 'primary' : 'success'}>
                        {exam.mode === 'pre' ? t('exam.mode.preShort') : t('exam.mode.postShort')}
                      </Badge>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </Link>

                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      className="text-slate-400 hover:text-danger"
                      onClick={() => setConfirmDelete(exam)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={t('common.delete')}
        description={confirmDelete?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && void removeExam(confirmDelete)}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          {confirmDelete && confirmDelete.submissionCount > 0
            ? `${confirmDelete.submissionCount} хариулт хамт устана.`
            : t('common.confirm')}
        </Alert>
      </Dialog>
    </AppLayout>
  );
}
