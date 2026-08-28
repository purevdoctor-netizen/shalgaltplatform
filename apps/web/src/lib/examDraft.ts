/**
 * Шалгалт үүсгэгчийн дотоод (ноорог) төлөв ба түүнийг API-ийн хэлбэр рүү
 * хөрвүүлэх, шалгах логик.
 */

import type { QuestionType } from '@shalgalt/shared';
import { FALSE_OPTION_ID, TRUE_OPTION_ID } from '@shalgalt/shared';
import { shortId, todayIsoDate } from './utils';

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const MAX_OPTIONS = OPTION_IDS.length;
export const MIN_OPTIONS = 2;

export interface DraftOption {
  id: string;
  text: string;
}

export interface DraftQuestion {
  /** Зөвхөн UI-д зориулсан тогтвортой түлхүүр (drag-and-drop). */
  key: string;
  type: QuestionType;
  text: string;
  options: DraftOption[];
  correctOptionIds: string[];
  /** Түүхий текст — таслалаар зааглана (ASSUMPTIONS B-10). */
  acceptedAnswers: string;
  points: number;
  topic: string;
}

export interface DraftExam {
  title: string;
  subject: string;
  teacherName: string;
  teacherEmail: string;
  examDate: string;
  durationMin: string;
  passThreshold: number;
  deliveryMode: 'online' | 'lan' | 'offlineQr';
  shuffle: boolean;
  showAnswersToStudent: boolean;
  onePerPage: boolean;
  questions: DraftQuestion[];
}

// ---------------------------------------------------------------------------
// Үүсгэх
// ---------------------------------------------------------------------------

export function createDraftQuestion(type: QuestionType = 'single'): DraftQuestion {
  return {
    key: shortId(10),
    type,
    text: '',
    options:
      type === 'truefalse'
        ? [
            { id: TRUE_OPTION_ID, text: 'Үнэн' },
            { id: FALSE_OPTION_ID, text: 'Худал' },
          ]
        : [
            { id: 'A', text: '' },
            { id: 'B', text: '' },
          ],
    correctOptionIds: type === 'truefalse' ? [TRUE_OPTION_ID] : [],
    acceptedAnswers: '',
    points: 1,
    topic: '',
  };
}

export function createDraftExam(): DraftExam {
  return {
    title: '',
    subject: '',
    teacherName: '',
    teacherEmail: '',
    examDate: todayIsoDate(),
    durationMin: '',
    passThreshold: 60,
    deliveryMode: 'online',
    shuffle: false,
    showAnswersToStudent: true,
    onePerPage: false,
    questions: [createDraftQuestion('single')],
  };
}

/** Төрөл солиход тохирох талбаруудыг тохируулна. */
export function changeQuestionType(question: DraftQuestion, type: QuestionType): DraftQuestion {
  if (type === question.type) return question;

  if (type === 'truefalse') {
    return {
      ...question,
      type,
      options: [
        { id: TRUE_OPTION_ID, text: 'Үнэн' },
        { id: FALSE_OPTION_ID, text: 'Худал' },
      ],
      correctOptionIds: [TRUE_OPTION_ID],
      acceptedAnswers: '',
    };
  }

  if (type === 'short') {
    return { ...question, type, options: [], correctOptionIds: [] };
  }

  // single / multi
  const options =
    question.options.length >= MIN_OPTIONS && question.type !== 'truefalse'
      ? question.options
      : [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
        ];
  const validIds = new Set(options.map((option) => option.id));
  const correct = question.correctOptionIds.filter((id) => validIds.has(id));

  return {
    ...question,
    type,
    options,
    correctOptionIds: type === 'single' ? correct.slice(0, 1) : correct,
    acceptedAnswers: '',
  };
}

/** Дараагийн боломжит сонголтын id. */
export function nextOptionId(options: readonly DraftOption[]): string | null {
  const used = new Set(options.map((option) => option.id));
  return OPTION_IDS.find((id) => !used.has(id)) ?? null;
}

// ---------------------------------------------------------------------------
// Шалгах
// ---------------------------------------------------------------------------

export interface DraftIssue {
  /** Асуултын `key`; шалгалтын түвшний алдаанд `null`. */
  questionKey: string | null;
  field: string;
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAcceptedAnswers(raw: string): string[] {
  // Давхар хашилтад бичсэн хариулт дотроо таслал агуулж болно: "1,5", 1.5
  const result: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of raw) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      if (current.trim() !== '') result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') result.push(current.trim());

  return [...new Set(result)];
}

export function validateDraft(
  draft: DraftExam,
  t: (key: string, params?: Record<string, string | number>) => string,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (field: string, message: string, questionKey: string | null = null) =>
    issues.push({ questionKey, field, message });

  if (draft.title.trim() === '') add('title', t('error.required'));
  if (draft.subject.trim() === '') add('subject', t('error.required'));
  if (draft.teacherName.trim() === '') add('teacherName', t('error.required'));
  if (!EMAIL_PATTERN.test(draft.teacherEmail.trim())) add('teacherEmail', t('error.invalidEmail'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.examDate)) add('examDate', t('error.required'));

  if (draft.durationMin.trim() !== '') {
    const minutes = Number(draft.durationMin);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) {
      add('durationMin', `${t('error.min', { min: 1 })} · ${t('error.max', { max: 300 })}`);
    }
  }

  if (draft.passThreshold < 0 || draft.passThreshold > 100) {
    add('passThreshold', `${t('error.min', { min: 0 })} · ${t('error.max', { max: 100 })}`);
  }

  if (draft.questions.length === 0) {
    add('questions', t('question.empty'));
  }

  draft.questions.forEach((question) => {
    const key = question.key;

    if (question.text.trim() === '') add('text', t('error.required'), key);
    if (!(question.points > 0)) add('points', t('error.min', { min: 0.5 }), key);
    if (Math.round(question.points * 2) !== question.points * 2) {
      add('points', '0.5', key);
    }

    if (question.type === 'single' || question.type === 'multi') {
      const filled = question.options.filter((option) => option.text.trim() !== '');
      if (filled.length < MIN_OPTIONS) add('options', t('error.required'), key);
      if (question.correctOptionIds.length === 0) add('correctOptionIds', t('error.required'), key);
      if (question.type === 'single' && question.correctOptionIds.length > 1) {
        add('correctOptionIds', t('question.type.single'), key);
      }
    }

    if (question.type === 'truefalse' && question.correctOptionIds.length !== 1) {
      add('correctOptionIds', t('error.required'), key);
    }

    if (question.type === 'short' && parseAcceptedAnswers(question.acceptedAnswers).length === 0) {
      add('acceptedAnswers', t('error.required'), key);
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// API-ийн хэлбэр рүү хөрвүүлэх
// ---------------------------------------------------------------------------

export function draftToApiPayload(draft: DraftExam): Record<string, unknown> {
  const duration = draft.durationMin.trim();

  return {
    title: draft.title.trim(),
    subject: draft.subject.trim(),
    teacherName: draft.teacherName.trim(),
    teacherEmail: draft.teacherEmail.trim(),
    examDate: draft.examDate,
    deliveryMode: draft.deliveryMode,
    passThreshold: draft.passThreshold,
    ...(duration === '' ? {} : { durationMin: Number(duration) }),
    shuffle: draft.shuffle,
    showAnswersToStudent: draft.showAnswersToStudent,
    onePerPage: draft.onePerPage,
    status: 'active',
    questions: draft.questions.map((question, index) => {
      const base: Record<string, unknown> = {
        order: index + 1,
        type: question.type,
        text: question.text.trim(),
        points: question.points,
      };
      if (question.topic.trim() !== '') base.topic = question.topic.trim();

      if (question.type === 'single' || question.type === 'multi') {
        const options = question.options
          .filter((option) => option.text.trim() !== '')
          .map((option) => ({ id: option.id, text: option.text.trim() }));
        const validIds = new Set(options.map((option) => option.id));
        base.options = options;
        base.correctOptionIds = question.correctOptionIds.filter((id) => validIds.has(id));
      } else if (question.type === 'truefalse') {
        base.correctOptionIds = question.correctOptionIds;
      } else {
        base.acceptedAnswers = parseAcceptedAnswers(question.acceptedAnswers);
      }

      return base;
    }),
  };
}

/** Нийт оноо (урьдчилан харахад). */
export function draftTotalPoints(draft: DraftExam): number {
  return draft.questions.reduce((sum, question) => sum + (question.points || 0), 0);
}

/** Ашиглагдсан сэдвүүд (autocomplete-д). */
export function draftTopics(draft: DraftExam): string[] {
  const topics = draft.questions
    .map((question) => question.topic.trim())
    .filter((topic) => topic !== '');
  return [...new Set(topics)].sort((a, b) => a.localeCompare(b, 'mn'));
}
