import { describe, expect, it } from 'vitest';
import {
  changeQuestionType,
  createDraftExam,
  createDraftQuestion,
  draftToApiPayload,
  draftTopics,
  draftTotalPoints,
  nextOptionId,
  parseAcceptedAnswers,
  validateDraft,
  type DraftExam,
} from './examDraft';

/** Тестэд шаардлагатай хамгийн бага орчуулагч. */
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

function validDraft(): DraftExam {
  const draft = createDraftExam();
  draft.title = 'Тест';
  draft.subject = 'Математик';
  draft.teacherName = 'Багш';
  draft.teacherEmail = 'bagsh@example.mn';

  const question = createDraftQuestion('single');
  question.text = 'Асуулт 1';
  question.options = [
    { id: 'A', text: 'Зөв' },
    { id: 'B', text: 'Буруу' },
  ];
  question.correctOptionIds = ['A'];
  draft.questions = [question];

  return draft;
}

describe('parseAcceptedAnswers', () => {
  it('таслалаар зааглана', () => {
    expect(parseAcceptedAnswers('3/4, 0.75')).toEqual(['3/4', '0.75']);
  });

  it('давхардлыг арилгана', () => {
    expect(parseAcceptedAnswers('20, 20 , 21')).toEqual(['20', '21']);
  });

  it('давхар хашилтад таслал агуулж болно', () => {
    expect(parseAcceptedAnswers('"1,5", 1.5')).toEqual(['1,5', '1.5']);
  });

  it('хоосон утгыг алгасна', () => {
    expect(parseAcceptedAnswers(' , , 20 , ')).toEqual(['20']);
    expect(parseAcceptedAnswers('')).toEqual([]);
  });
});

describe('changeQuestionType', () => {
  it('truefalse болгоход Үнэн/Худал сонголт үүснэ', () => {
    const changed = changeQuestionType(createDraftQuestion('single'), 'truefalse');
    expect(changed.options.map((option) => option.id)).toEqual(['A', 'B']);
    expect(changed.correctOptionIds).toEqual(['A']);
  });

  it('short болгоход сонголт цэвэрлэгдэнэ', () => {
    const changed = changeQuestionType(createDraftQuestion('single'), 'short');
    expect(changed.options).toEqual([]);
    expect(changed.correctOptionIds).toEqual([]);
  });

  it('multi → single үед зөвхөн эхний зөв хариулт үлдэнэ', () => {
    const multi = createDraftQuestion('multi');
    multi.options = [
      { id: 'A', text: 'A' },
      { id: 'B', text: 'B' },
      { id: 'C', text: 'C' },
    ];
    multi.correctOptionIds = ['A', 'C'];
    expect(changeQuestionType(multi, 'single').correctOptionIds).toEqual(['A']);
  });

  it('ижил төрөл бол өөрчлөгдөхгүй', () => {
    const question = createDraftQuestion('single');
    expect(changeQuestionType(question, 'single')).toBe(question);
  });
});

describe('nextOptionId', () => {
  it('дараагийн боломжит үсгийг өгнө', () => {
    expect(nextOptionId([{ id: 'A', text: '' }])).toBe('B');
    expect(
      nextOptionId([
        { id: 'A', text: '' },
        { id: 'C', text: '' },
      ]),
    ).toBe('B');
  });

  it('6 сонголт дүүрсэн бол null', () => {
    const full = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, text: '' }));
    expect(nextOptionId(full)).toBeNull();
  });
});

describe('validateDraft', () => {
  it('зөв ноорогт алдаа гарахгүй', () => {
    expect(validateDraft(validDraft(), t)).toEqual([]);
  });

  it('заавал талбарууд хоосон бол алдаа', () => {
    const draft = createDraftExam();
    const issues = validateDraft(draft, t);
    const fields = issues.map((issue) => issue.field);
    expect(fields).toContain('title');
    expect(fields).toContain('subject');
    expect(fields).toContain('teacherName');
    expect(fields).toContain('teacherEmail');
  });

  it('буруу имэйл', () => {
    const draft = validDraft();
    draft.teacherEmail = 'муу-имэйл';
    expect(validateDraft(draft, t).some((issue) => issue.field === 'teacherEmail')).toBe(true);
  });

  it('хугацаа хязгаараас гарвал алдаа', () => {
    const draft = validDraft();
    draft.durationMin = '500';
    expect(validateDraft(draft, t).some((issue) => issue.field === 'durationMin')).toBe(true);
  });

  it('single төрөлд олон зөв хариулт байвал алдаа', () => {
    const draft = validDraft();
    draft.questions[0]!.correctOptionIds = ['A', 'B'];
    expect(validateDraft(draft, t).some((issue) => issue.field === 'correctOptionIds')).toBe(true);
  });

  it('short төрөлд хариулт заагаагүй бол алдаа', () => {
    const draft = validDraft();
    draft.questions[0] = { ...changeQuestionType(draft.questions[0]!, 'short'), text: 'Асуулт' };
    expect(validateDraft(draft, t).some((issue) => issue.field === 'acceptedAnswers')).toBe(true);
  });

  it('оноо 0.5-ийн алхамгүй бол алдаа', () => {
    const draft = validDraft();
    draft.questions[0]!.points = 1.3;
    expect(validateDraft(draft, t).some((issue) => issue.field === 'points')).toBe(true);
  });
});

describe('draftToApiPayload', () => {
  it('дарааллыг 1-ээс дугаарлана', () => {
    const draft = validDraft();
    const second = createDraftQuestion('single');
    second.text = 'Хоёр';
    second.options = [
      { id: 'A', text: 'A' },
      { id: 'B', text: 'B' },
    ];
    second.correctOptionIds = ['B'];
    draft.questions.push(second);

    const payload = draftToApiPayload(draft) as { questions: { order: number }[] };
    expect(payload.questions.map((question) => question.order)).toEqual([1, 2]);
  });

  it('хоосон сонголтыг хасна', () => {
    const draft = validDraft();
    draft.questions[0]!.options.push({ id: 'C', text: '   ' });

    const payload = draftToApiPayload(draft) as {
      questions: { options: { id: string }[] }[];
    };
    expect(payload.questions[0]!.options.map((option) => option.id)).toEqual(['A', 'B']);
  });

  it('durationMin хоосон бол талбар огт орохгүй', () => {
    const draft = validDraft();
    draft.durationMin = '';
    expect('durationMin' in draftToApiPayload(draft)).toBe(false);

    draft.durationMin = '20';
    expect(draftToApiPayload(draft).durationMin).toBe(20);
  });

  it('short төрөлд acceptedAnswers задарна', () => {
    const draft = validDraft();
    const short = changeQuestionType(draft.questions[0]!, 'short');
    short.text = 'Асуулт';
    short.acceptedAnswers = '20, 20.0';
    draft.questions = [short];

    const payload = draftToApiPayload(draft) as {
      questions: { acceptedAnswers: string[] }[];
    };
    expect(payload.questions[0]!.acceptedAnswers).toEqual(['20', '20.0']);
  });
});

describe('туслахууд', () => {
  it('нийт оноо', () => {
    const draft = validDraft();
    draft.questions[0]!.points = 2;
    expect(draftTotalPoints(draft)).toBe(2);
  });

  it('сэдвүүд давхардалгүй, эрэмбэлэгдсэн', () => {
    const draft = validDraft();
    draft.questions[0]!.topic = 'Хувь';
    const second = createDraftQuestion('single');
    second.topic = 'Бутархай';
    const third = createDraftQuestion('single');
    third.topic = 'Хувь';
    draft.questions.push(second, third);

    expect(draftTopics(draft)).toEqual(['Бутархай', 'Хувь']);
  });
});
