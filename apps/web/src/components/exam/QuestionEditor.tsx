/**
 * Нэг асуултын засварлагч — чирж дараалал солих боломжтой карт.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { QuestionType } from '@shalgalt/shared';
import { useT } from '../../i18n';
import { cn } from '../../lib/utils';
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  changeQuestionType,
  nextOptionId,
  type DraftIssue,
  type DraftQuestion,
} from '../../lib/examDraft';
import { Button, FieldError, FieldHint, Input, Label, Select, Textarea } from '../ui';

const TYPES: QuestionType[] = ['single', 'multi', 'truefalse', 'short'];

export function QuestionEditor({
  question,
  index,
  issues,
  topics,
  onChange,
  onDelete,
  onDuplicate,
  canDelete,
}: {
  question: DraftQuestion;
  index: number;
  issues: DraftIssue[];
  topics: string[];
  onChange: (next: DraftQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  canDelete: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.key,
  });

  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  const patch = (changes: Partial<DraftQuestion>) => onChange({ ...question, ...changes });

  const toggleCorrect = (optionId: string) => {
    if (question.type === 'single' || question.type === 'truefalse') {
      patch({ correctOptionIds: [optionId] });
      return;
    }
    const current = new Set(question.correctOptionIds);
    if (current.has(optionId)) current.delete(optionId);
    else current.add(optionId);
    patch({ correctOptionIds: [...current] });
  };

  const updateOption = (optionId: string, text: string) => {
    patch({
      options: question.options.map((option) =>
        option.id === optionId ? { ...option, text } : option,
      ),
    });
  };

  const addOption = () => {
    const id = nextOptionId(question.options);
    if (!id) return;
    patch({ options: [...question.options, { id, text: '' }] });
  };

  const removeOption = (optionId: string) => {
    if (question.options.length <= MIN_OPTIONS) return;
    patch({
      options: question.options.filter((option) => option.id !== optionId),
      correctOptionIds: question.correctOptionIds.filter((id) => id !== optionId),
    });
  };

  const showOptions = question.type === 'single' || question.type === 'multi';
  const topicListId = `topics-${question.key}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'card p-4 transition-shadow',
        isDragging && 'z-10 shadow-soft-lg ring-2 ring-primary/40',
        issues.length > 0 && 'border-danger-100',
      )}
    >
      {/* Толгой */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="touch-target flex cursor-grab items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
          aria-label={t('question.dragHandle')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>

        <span className="font-semibold text-slate-900">
          {t('question.number', { n: index + 1 })}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            aria-label={t('question.duplicate')}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={!canDelete}
            aria-label={t('common.delete')}
            className="text-danger hover:bg-danger-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Төрөл / оноо / сэдэв */}
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
        <div>
          <Label htmlFor={`type-${question.key}`}>{t('question.type')}</Label>
          <Select
            id={`type-${question.key}`}
            value={question.type}
            onChange={(event) =>
              onChange(changeQuestionType(question, event.target.value as QuestionType))
            }
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`question.type.${type}`)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={`points-${question.key}`}>{t('question.points')}</Label>
          <Input
            id={`points-${question.key}`}
            type="number"
            min={0.5}
            step={0.5}
            value={question.points}
            onChange={(event) => patch({ points: Number(event.target.value) })}
            aria-invalid={issueFor('points') !== undefined}
          />
          <FieldError>{issueFor('points')}</FieldError>
        </div>

        <div>
          <Label htmlFor={`topic-${question.key}`}>{t('question.topic')}</Label>
          <Input
            id={`topic-${question.key}`}
            list={topicListId}
            value={question.topic}
            onChange={(event) => patch({ topic: event.target.value })}
            placeholder={t('question.topicPlaceholder')}
            autoComplete="off"
          />
          <datalist id={topicListId}>
            {topics.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Асуултын текст */}
      <div className="mb-3">
        <Label htmlFor={`text-${question.key}`} required>
          {t('question.text')}
        </Label>
        <Textarea
          id={`text-${question.key}`}
          value={question.text}
          onChange={(event) => patch({ text: event.target.value })}
          placeholder={t('question.textPlaceholder')}
          aria-invalid={issueFor('text') !== undefined}
        />
        <FieldError>{issueFor('text')}</FieldError>
      </div>

      {/* Сонголтууд */}
      {showOptions && (
        <fieldset className="mb-1">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            {t('question.options')}
          </legend>

          <ul className="space-y-2">
            {question.options.map((option) => {
              const checked = question.correctOptionIds.includes(option.id);
              return (
                <li key={option.id} className="flex items-center gap-2">
                  <label
                    className="touch-target flex cursor-pointer items-center justify-center rounded-xl px-2 hover:bg-slate-100"
                    title={t('question.correct')}
                  >
                    <input
                      type={question.type === 'single' ? 'radio' : 'checkbox'}
                      name={`correct-${question.key}`}
                      checked={checked}
                      onChange={() => toggleCorrect(option.id)}
                      className="h-5 w-5 accent-success"
                      aria-label={`${option.id} — ${t('question.correct')}`}
                    />
                  </label>

                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-slate-500">
                    {option.id}
                  </span>

                  <Input
                    value={option.text}
                    onChange={(event) => updateOption(option.id, event.target.value)}
                    placeholder={`${t('question.options')} ${option.id}`}
                    className={cn(checked && 'border-success-600 bg-success-50')}
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(option.id)}
                    disabled={question.options.length <= MIN_OPTIONS}
                    aria-label={`${t('common.delete')} ${option.id}`}
                    className="text-slate-400 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <FieldError>{issueFor('options') ?? issueFor('correctOptionIds')}</FieldError>

          {question.options.length < MAX_OPTIONS && (
            <Button variant="ghost" size="sm" onClick={addOption} className="mt-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('question.addOption')}
            </Button>
          )}
        </fieldset>
      )}

      {/* Үнэн / Худал */}
      {question.type === 'truefalse' && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            {t('question.correct')}
          </legend>
          <div className="flex gap-2">
            {question.options.map((option) => {
              const checked = question.correctOptionIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    'touch-target flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4',
                    checked
                      ? 'border-success-600 bg-success-50 font-medium text-success-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name={`tf-${question.key}`}
                    checked={checked}
                    onChange={() => toggleCorrect(option.id)}
                    className="h-4 w-4 accent-success"
                  />
                  {option.id === 'A' ? t('question.true') : t('question.false')}
                </label>
              );
            })}
          </div>
          <FieldError>{issueFor('correctOptionIds')}</FieldError>
        </fieldset>
      )}

      {/* Богино хариулт */}
      {question.type === 'short' && (
        <div>
          <Label htmlFor={`accepted-${question.key}`} required>
            {t('question.acceptedAnswers')}
          </Label>
          <Input
            id={`accepted-${question.key}`}
            value={question.acceptedAnswers}
            onChange={(event) => patch({ acceptedAnswers: event.target.value })}
            placeholder="3/4, 0.75"
            aria-invalid={issueFor('acceptedAnswers') !== undefined}
          />
          <FieldHint>{t('question.acceptedAnswersHint')}</FieldHint>
          <FieldError>{issueFor('acceptedAnswers')}</FieldError>
        </div>
      )}
    </li>
  );
}
