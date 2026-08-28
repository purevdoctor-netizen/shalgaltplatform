/**
 * Алхам 3 — Сурагчийн бүртгэл.
 *
 * ДАРААХ шалгалтын үед энэ төхөөрөмж дээр өмнө бүртгүүлсэн бол талбарууд
 * автоматаар бөглөгдөнө (засах боломжтой).
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, RotateCcw } from 'lucide-react';
import { computeStudentKey } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  FieldError,
  Input,
  Label,
  LoadingState,
} from '../../components/ui';
import { useT } from '../../i18n';
import { useStudentExam } from '../../lib/useStudentExam';
import { findLocalSubmission, getDraft, getSetting, setSetting } from '../../db';

interface StoredIdentity {
  lastName: string;
  firstName: string;
  className: string;
}

const IDENTITY_KEY = 'studentIdentity';

export default function StudentEntryPage() {
  const t = useT();
  const navigate = useNavigate();
  const { exam, examId, loading, error, fromCache } = useStudentExam();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [className, setClassName] = useState('');
  const [touched, setTouched] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Өмнөх бүртгэлээс автоматаар бөглөнө
  useEffect(() => {
    void getSetting<StoredIdentity | null>(IDENTITY_KEY, null).then((identity) => {
      if (!identity) return;
      setLastName(identity.lastName);
      setFirstName(identity.firstName);
      setClassName(identity.className);
    });
  }, []);

  // Аль хэдийн өгсөн эсэх / дуусаагүй оролдлого байгаа эсэхийг шалгана
  useEffect(() => {
    if (!exam || lastName.trim() === '' || firstName.trim() === '' || className.trim() === '') {
      setAlreadyDone(false);
      setHasDraft(false);
      return;
    }
    const key = computeStudentKey(lastName, firstName, className);
    void findLocalSubmission(exam.id, exam.mode, key).then((found) => setAlreadyDone(!!found));
    void getDraft(exam.id, exam.mode, key).then((draft) => setHasDraft(!!draft));
  }, [exam, lastName, firstName, className]);

  const invalid =
    lastName.trim() === '' ||
    firstName.trim() === '' ||
    className.trim() === '' ||
    lastName.trim().length > 50 ||
    firstName.trim().length > 50 ||
    className.trim().length > 50;

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || !exam) return;

    await setSetting(IDENTITY_KEY, {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      className: className.trim(),
    } satisfies StoredIdentity);

    const key = computeStudentKey(lastName, firstName, className);
    navigate(`/exam/${exam.id}/take?k=${key}`);
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
          title={error === 'network' ? t('error.network') : t('error.examNotFound')}
          message={error === 'notFound' ? `${t('common.of')} ${examId}` : undefined}
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
    <AppLayout title={exam.title} subtitle={`${exam.subject} · ${exam.teacherName}`}>
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex justify-center">
          <Badge tone={exam.mode === 'pre' ? 'primary' : 'success'} className="px-4 py-2 text-sm">
            {exam.mode === 'pre' ? t('exam.mode.pre') : t('exam.mode.post')}
          </Badge>
        </div>

        {fromCache && <Alert tone="warning">{t('online.offline')}</Alert>}

        <Card>
          <CardHeader>
            <CardTitle>{t('student.register')}</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={start} className="space-y-4">
              <div>
                <Label htmlFor="lastName" required>
                  {t('student.lastName')}
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  maxLength={50}
                  autoComplete="family-name"
                  aria-invalid={touched && lastName.trim() === ''}
                />
                <FieldError>
                  {touched && lastName.trim() === '' ? t('error.required') : undefined}
                </FieldError>
              </div>

              <div>
                <Label htmlFor="firstName" required>
                  {t('student.firstName')}
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  maxLength={50}
                  autoComplete="given-name"
                  aria-invalid={touched && firstName.trim() === ''}
                />
                <FieldError>
                  {touched && firstName.trim() === '' ? t('error.required') : undefined}
                </FieldError>
              </div>

              <div>
                <Label htmlFor="className" required>
                  {t('student.className')}
                </Label>
                <Input
                  id="className"
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  maxLength={50}
                  placeholder={t('student.classPlaceholder')}
                  aria-invalid={touched && className.trim() === ''}
                />
                <FieldError>
                  {touched && className.trim() === '' ? t('error.required') : undefined}
                </FieldError>
              </div>

              <div>
                <Label htmlFor="examName">{t('student.examName')}</Label>
                <Input id="examName" value={exam.title} readOnly disabled />
              </div>

              {alreadyDone && <Alert tone="warning">{t('student.alreadySubmitted')}</Alert>}
              {hasDraft && !alreadyDone && (
                <Alert tone="primary">
                  <span className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('student.resumeFound')}
                  </span>
                </Alert>
              )}

              <Button type="submit" size="lg" block disabled={invalid}>
                <LogIn className="h-5 w-5" aria-hidden="true" />
                {hasDraft ? t('student.continue') : t('student.start')}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-xs text-slate-500">
          {exam.questions.length} {t('question.title').toLowerCase()}
          {exam.durationMin !== undefined && ` · ${exam.durationMin} ${t('common.minutes')}`}
        </p>
      </div>
    </AppLayout>
  );
}
