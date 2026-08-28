/**
 * Алхам 1 — Багш шалгалт үүсгэнэ.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Eye, FileUp, Plus, Save } from 'lucide-react';
import type { DeliveryMode } from '@shalgalt/shared';
import { AppLayout } from '../../components/layout/AppLayout';
import { ExamPreview } from '../../components/exam/ExamPreview';
import { ImportDialog } from '../../components/exam/ImportDialog';
import { QuestionEditor } from '../../components/exam/QuestionEditor';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Switch,
} from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { useT } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { saveExamLocally } from '../../db';
import {
  createDraftExam,
  createDraftQuestion,
  draftTopics,
  draftToApiPayload,
  draftTotalPoints,
  validateDraft,
  type DraftExam,
  type DraftQuestion,
} from '../../lib/examDraft';
import { QR_QUESTION_WARN_THRESHOLD } from '@shalgalt/shared';

const DELIVERY_MODES: DeliveryMode[] = ['online', 'lan', 'offlineQr'];

export default function CreateExamPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [draft, setDraft] = useState<DraftExam>(createDraftExam);

  // Нэвтэрсэн багшийн нэр/имэйлээр автоматаар бөглөнө (засах боломжтой)
  useEffect(() => {
    if (!user) return;
    setDraft((current) => ({
      ...current,
      teacherName: current.teacherName === '' ? user.fullName : current.teacherName,
      teacherEmail: current.teacherEmail === '' ? (user.email ?? '') : current.teacherEmail,
    }));
  }, [user]);
  const [showIssues, setShowIssues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const issues = useMemo(() => validateDraft(draft, t), [draft, t]);
  const topics = useMemo(() => draftTopics(draft), [draft]);
  const totalPoints = draftTotalPoints(draft);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const examIssue = (field: string) =>
    showIssues
      ? issues.find((issue) => issue.questionKey === null && issue.field === field)?.message
      : undefined;

  const patch = (changes: Partial<DraftExam>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // -------------------------------------------------------------------------
  // Асуултын үйлдлүүд
  // -------------------------------------------------------------------------

  const updateQuestion = (key: string, next: DraftQuestion) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.key === key ? next : question)),
    }));
  };

  const addQuestion = () => {
    setDraft((current) => ({
      ...current,
      questions: [...current.questions, createDraftQuestion('single')],
    }));
  };

  const duplicateQuestion = (key: string) => {
    setDraft((current) => {
      const index = current.questions.findIndex((question) => question.key === key);
      const source = current.questions[index];
      if (index === -1 || !source) return current;

      const copy: DraftQuestion = {
        ...source,
        key: createDraftQuestion().key,
        options: source.options.map((option) => ({ ...option })),
        correctOptionIds: [...source.correctOptionIds],
      };
      const questions = [...current.questions];
      questions.splice(index + 1, 0, copy);
      return { ...current, questions };
    });
  };

  const deleteQuestion = (key: string) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.key !== key),
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraft((current) => {
      const from = current.questions.findIndex((question) => question.key === active.id);
      const to = current.questions.findIndex((question) => question.key === over.id);
      if (from === -1 || to === -1) return current;
      return { ...current, questions: arrayMove(current.questions, from, to) };
    });
  };

  const handleImport = (questions: DraftQuestion[]) => {
    setDraft((current) => {
      // Анхны хоосон асуултыг орлуулна
      const existing = current.questions.filter(
        (question) => question.text.trim() !== '' || question.options.some((o) => o.text !== ''),
      );
      return { ...current, questions: [...existing, ...questions] };
    });
    toast.success(t('import.imported', { count: questions.length }));
  };

  // -------------------------------------------------------------------------
  // Хадгалах
  // -------------------------------------------------------------------------

  const save = async () => {
    setShowIssues(true);
    if (issues.length > 0) {
      toast.error(t('common.error'));
      const firstQuestion = issues.find((issue) => issue.questionKey !== null)?.questionKey;
      const target = firstQuestion
        ? document.querySelector(`[data-question-key="${firstQuestion}"]`)
        : document.querySelector('form');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSaving(true);
    try {
      const { exam } = await api.createExam(draftToApiPayload(draft));
      await saveExamLocally(exam, { ownedByMe: true });
      toast.success(t('teacher.linkSaved'));
      navigate(`/teacher/${exam.id}/qr?t=${encodeURIComponent(exam.teacherToken)}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.isOffline
            ? t('error.offlineAction')
            : error.message
          : t('common.unknownError');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const offlineQrWarning =
    draft.deliveryMode === 'offlineQr' && draft.questions.length > QR_QUESTION_WARN_THRESHOLD;

  return (
    <AppLayout title={t('nav.createExam')}>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {/* --- Үндсэн мэдээлэл --- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('nav.createExam')}</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="title" required>
                {t('exam.title')}
              </Label>
              <Input
                id="title"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder={t('exam.titlePlaceholder')}
                aria-invalid={examIssue('title') !== undefined}
              />
              <FieldError>{examIssue('title')}</FieldError>
            </div>

            <div>
              <Label htmlFor="subject" required>
                {t('exam.subject')}
              </Label>
              <Input
                id="subject"
                value={draft.subject}
                onChange={(event) => patch({ subject: event.target.value })}
                placeholder={t('exam.subjectPlaceholder')}
                aria-invalid={examIssue('subject') !== undefined}
              />
              <FieldError>{examIssue('subject')}</FieldError>
            </div>

            <div>
              <Label htmlFor="teacherName" required>
                {t('exam.teacherName')}
              </Label>
              <Input
                id="teacherName"
                value={draft.teacherName}
                onChange={(event) => patch({ teacherName: event.target.value })}
                autoComplete="name"
                aria-invalid={examIssue('teacherName') !== undefined}
              />
              <FieldError>{examIssue('teacherName')}</FieldError>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="teacherEmail" required>
                {t('exam.teacherEmail')}
              </Label>
              <Input
                id="teacherEmail"
                type="email"
                inputMode="email"
                value={draft.teacherEmail}
                onChange={(event) => patch({ teacherEmail: event.target.value })}
                autoComplete="email"
                aria-invalid={examIssue('teacherEmail') !== undefined}
              />
              <FieldHint>{t('exam.teacherEmailHint')}</FieldHint>
              <FieldError>{examIssue('teacherEmail')}</FieldError>
            </div>

            <div>
              <Label htmlFor="examDate" required>
                {t('exam.date')}
              </Label>
              <Input
                id="examDate"
                type="date"
                value={draft.examDate}
                onChange={(event) => patch({ examDate: event.target.value })}
                aria-invalid={examIssue('examDate') !== undefined}
              />
              <FieldError>{examIssue('examDate')}</FieldError>
            </div>

            <div>
              <Label htmlFor="durationMin">{t('exam.duration')}</Label>
              <Input
                id="durationMin"
                type="number"
                min={1}
                max={300}
                inputMode="numeric"
                value={draft.durationMin}
                onChange={(event) => patch({ durationMin: event.target.value })}
                aria-invalid={examIssue('durationMin') !== undefined}
              />
              <FieldHint>{t('exam.durationHint')}</FieldHint>
              <FieldError>{examIssue('durationMin')}</FieldError>
            </div>

            <div>
              <Label htmlFor="passThreshold">{t('exam.passThreshold')}</Label>
              <Input
                id="passThreshold"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={draft.passThreshold}
                onChange={(event) => patch({ passThreshold: Number(event.target.value) })}
                aria-invalid={examIssue('passThreshold') !== undefined}
              />
              <FieldError>{examIssue('passThreshold')}</FieldError>
            </div>

            <div>
              <Label htmlFor="deliveryMode">{t('exam.deliveryMode')}</Label>
              <Select
                id="deliveryMode"
                value={draft.deliveryMode}
                onChange={(event) => patch({ deliveryMode: event.target.value as DeliveryMode })}
              >
                {DELIVERY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`delivery.${mode}`)}
                  </option>
                ))}
              </Select>
              <FieldHint>{t(`delivery.${draft.deliveryMode}.hint`)}</FieldHint>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Switch
                id="shuffle"
                checked={draft.shuffle}
                onCheckedChange={(checked) => patch({ shuffle: checked })}
                label={t('exam.shuffle')}
                hint={t('exam.shuffleHint')}
              />
              <Switch
                id="showAnswers"
                checked={draft.showAnswersToStudent}
                onCheckedChange={(checked) => patch({ showAnswersToStudent: checked })}
                label={t('exam.showAnswers')}
              />
              <Switch
                id="onePerPage"
                checked={draft.onePerPage}
                onCheckedChange={(checked) => patch({ onePerPage: checked })}
                label={t('exam.onePerPage')}
              />
            </div>
          </CardBody>
        </Card>

        {offlineQrWarning && (
          <Alert tone="warning">
            {t('qr.tooManyQuestions', {
              count: draft.questions.length,
              slides: Math.ceil(draft.questions.length / 8),
            })}
          </Alert>
        )}

        {/* --- Асуултууд --- */}
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('question.title')}{' '}
              <span className="text-sm font-normal text-slate-500">
                ({draft.questions.length} · {totalPoints} {t('common.points')})
              </span>
            </h2>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                {t('import.button')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                disabled={draft.questions.length === 0}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t('preview.button')}
              </Button>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.questions.map((question) => question.key)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-3">
                {draft.questions.map((question, index) => (
                  <div key={question.key} data-question-key={question.key}>
                    <QuestionEditor
                      question={question}
                      index={index}
                      issues={
                        showIssues
                          ? issues.filter((issue) => issue.questionKey === question.key)
                          : []
                      }
                      topics={topics}
                      onChange={(next) => updateQuestion(question.key, next)}
                      onDelete={() => deleteQuestion(question.key)}
                      onDuplicate={() => duplicateQuestion(question.key)}
                      canDelete={draft.questions.length > 1}
                    />
                  </div>
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <Button variant="secondary" onClick={addQuestion} className="mt-3" block>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('question.add')}
          </Button>
        </section>

        {/* --- Хадгалах --- */}
        <div className="sticky bottom-4 z-20">
          <div className="card flex flex-wrap items-center gap-3 p-3">
            <p className="text-sm text-slate-600">
              {draft.questions.length} {t('question.title').toLowerCase()} · {totalPoints}{' '}
              {t('common.points')}
            </p>
            {showIssues && issues.length > 0 && (
              <p className="text-sm text-danger" role="alert">
                {issues.length} {t('common.error').toLowerCase()}
              </p>
            )}
            <Button type="submit" size="lg" className="ml-auto" disabled={saving}>
              <Save className="h-5 w-5" aria-hidden="true" />
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </form>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} />
      <ExamPreview open={previewOpen} onOpenChange={setPreviewOpen} draft={draft} />
    </AppLayout>
  );
}
