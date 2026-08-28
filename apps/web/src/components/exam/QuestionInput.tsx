/**
 * Сурагчийн хариулт оруулах хэсэг — асуултын төрлөөс хамаарна.
 */

import type { AnswerValue, Question } from '@shalgalt/shared';
import { FALSE_OPTION_ID, TRUE_OPTION_ID } from '@shalgalt/shared';
import { useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { Badge, Input } from '../ui';

export function QuestionInput({
  question,
  index,
  value,
  onChange,
}: {
  question: Question;
  index: number;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  const t = useT();
  const name = `q-${question.id}`;

  const selectedMulti = Array.isArray(value) ? new Set(value) : new Set<string>();

  const toggleMulti = (optionId: string) => {
    const next = new Set(selectedMulti);
    if (next.has(optionId)) next.delete(optionId);
    else next.add(optionId);
    onChange([...next]);
  };

  const options =
    question.type === 'truefalse'
      ? [
          { id: TRUE_OPTION_ID, text: t('question.true') },
          { id: FALSE_OPTION_ID, text: t('question.false') },
        ]
      : (question.options ?? []);

  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
          {index + 1}
        </span>
        <p className="flex-1 font-medium text-slate-900">{question.text}</p>
        <Badge>{question.points}</Badge>
      </div>

      {/* single / truefalse */}
      {(question.type === 'single' || question.type === 'truefalse') && (
        <fieldset>
          <legend className="sr-only">{t('student.selectOne')}</legend>
          <ul className="space-y-2">
            {options.map((option) => {
              const checked =
                question.type === 'truefalse'
                  ? (value === true && option.id === TRUE_OPTION_ID) ||
                    (value === false && option.id === FALSE_OPTION_ID)
                  : value === option.id;

              return (
                <li key={option.id}>
                  <label
                    className={cn(
                      'flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                      checked
                        ? 'border-primary bg-primary-50 font-medium text-primary-900'
                        : 'border-slate-300 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      checked={checked}
                      onChange={() =>
                        onChange(
                          question.type === 'truefalse' ? option.id === TRUE_OPTION_ID : option.id,
                        )
                      }
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span className="w-5 shrink-0 text-sm font-semibold text-slate-400">
                      {option.id}
                    </span>
                    <span className="flex-1">{option.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {/* multi */}
      {question.type === 'multi' && (
        <fieldset>
          <legend className="mb-2 text-sm text-slate-500">{t('student.selectMany')}</legend>
          <ul className="space-y-2">
            {options.map((option) => {
              const checked = selectedMulti.has(option.id);
              return (
                <li key={option.id}>
                  <label
                    className={cn(
                      'flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                      checked
                        ? 'border-primary bg-primary-50 font-medium text-primary-900'
                        : 'border-slate-300 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMulti(option.id)}
                      className="h-5 w-5 shrink-0 rounded accent-primary"
                    />
                    <span className="w-5 shrink-0 text-sm font-semibold text-slate-400">
                      {option.id}
                    </span>
                    <span className="flex-1">{option.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {/* short */}
      {question.type === 'short' && (
        <div>
          <label htmlFor={name} className="sr-only">
            {t('student.answerHere')}
          </label>
          <Input
            id={name}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t('student.answerHere')}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
