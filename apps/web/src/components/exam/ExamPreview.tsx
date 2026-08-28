/**
 * Урьдчилан харах — сурагчийн дэлгэц яг ийм харагдана.
 */

import { useT } from '../../i18n';
import { parseAcceptedAnswers, type DraftExam } from '../../lib/examDraft';
import { Alert, Badge, Dialog } from '../ui';

export function ExamPreview({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: DraftExam;
}) {
  const t = useT();
  const totalPoints = draft.questions.reduce((sum, question) => sum + (question.points || 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('preview.title')}
      description={t('preview.studentView')}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-header-gradient px-4 py-3 text-white">
          <p className="font-semibold">{draft.title || t('exam.title')}</p>
          <p className="text-sm text-white/85">
            {draft.subject} · {draft.teacherName}
          </p>
          <p className="mt-1 text-xs text-white/75">
            {draft.questions.length} {t('question.title').toLowerCase()} · {totalPoints}{' '}
            {t('common.points')}
            {draft.durationMin !== '' && ` · ${draft.durationMin} ${t('common.minutes')}`}
          </p>
        </div>

        {draft.shuffle && <Alert tone="primary">{t('exam.shuffleHint')}</Alert>}

        <ol className="space-y-4">
          {draft.questions.map((question, index) => (
            <li key={question.key} className="rounded-2xl border border-slate-200 p-3">
              <div className="mb-2 flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                  {index + 1}
                </span>
                <p className="flex-1 font-medium text-slate-900">
                  {question.text || t('question.textPlaceholder')}
                </p>
                <Badge>{question.points}</Badge>
              </div>

              {(question.type === 'single' || question.type === 'multi') && (
                <ul className="space-y-1.5 pl-8">
                  {question.options
                    .filter((option) => option.text.trim() !== '')
                    .map((option) => (
                      <li
                        key={option.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <span
                          className={
                            question.type === 'single'
                              ? 'h-4 w-4 shrink-0 rounded-full border-2 border-slate-300'
                              : 'h-4 w-4 shrink-0 rounded border-2 border-slate-300'
                          }
                          aria-hidden="true"
                        />
                        {option.text}
                      </li>
                    ))}
                </ul>
              )}

              {question.type === 'truefalse' && (
                <div className="flex gap-2 pl-8">
                  <span className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm">
                    {t('question.true')}
                  </span>
                  <span className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm">
                    {t('question.false')}
                  </span>
                </div>
              )}

              {question.type === 'short' && (
                <div className="pl-8">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                    {t('student.answerHere')}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {parseAcceptedAnswers(question.acceptedAnswers).length}{' '}
                    {t('question.acceptedAnswers').toLowerCase()}
                  </p>
                </div>
              )}

              {question.topic.trim() !== '' && (
                <p className="mt-2 pl-8 text-xs text-slate-400">{question.topic}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
