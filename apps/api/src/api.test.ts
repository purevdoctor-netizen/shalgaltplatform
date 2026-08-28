/**
 * API-ийн интеграцийн тест — бодит SQLite сан дээр бүрэн урсгалыг шалгана.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { computeStudentKey } from '@shalgalt/shared';
import { createApp } from './app';
import { createPrismaClient } from './lib/prisma';
import { createUser } from './services/authService';
import { TEST_DATABASE_URL } from './test/setup';

let prisma: PrismaClient;
let app: Express;

/** Нэвтэрсэн админ (cookie хадгалдаг агент). */
let admin: ReturnType<typeof request.agent>;

const ADMIN_PASSWORD = 'TestAdmin!2026';

/**
 * Шинэ багшийн данс нээж, нэвтэрч, нууц үгээ сольсон агент буцаана.
 * (Түр нууц үгтэй хэрэглэгч бусад үйлдэл хийж чадахгүй.)
 */
async function newTeacherAgent(username: string, fullName = 'Тест багш') {
  const created = await request(app)
    .post('/api/admin/users')
    .set('Cookie', adminCookie)
    .send({ username, fullName, role: 'teacher' });
  expect(created.status).toBe(201);

  const tempPassword = created.body.tempPassword as string;
  const agent = request.agent(app);

  const loggedIn = await agent.post('/api/auth/login').send({ username, password: tempPassword });
  expect(loggedIn.status).toBe(200);

  const changed = await agent
    .post('/api/auth/password')
    .send({ currentPassword: tempPassword, newPassword: `${username}!Shine2026` });
  expect(changed.status).toBe(200);

  return { agent, userId: created.body.user.id as string };
}

let adminCookie: string[] = [];

/** Тест бүрд ижил бүтэцтэй шалгалт үүсгэх өгөгдөл. */
function examPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Бутархай — үнэлгээ',
    subject: 'Математик',
    teacherName: 'Б.Пүрэвдорж',
    teacherEmail: 'bagsh@example.mn',
    examDate: '2026-03-02',
    deliveryMode: 'online',
    passThreshold: 60,
    durationMin: 20,
    shuffle: false,
    showAnswersToStudent: true,
    onePerPage: false,
    status: 'active',
    questions: [
      {
        order: 1,
        type: 'single',
        text: '3/4 нь аравтын бутархайгаар хэд вэ?',
        options: [
          { id: 'A', text: '0.75' },
          { id: 'B', text: '0.34' },
        ],
        correctOptionIds: ['A'],
        points: 1,
        topic: 'Энгийн бутархай',
      },
      {
        order: 2,
        type: 'multi',
        text: 'Аль нь 0.5-тай тэнцүү вэ?',
        options: [
          { id: 'A', text: '1/2' },
          { id: 'B', text: '50%' },
          { id: 'C', text: '5/100' },
        ],
        correctOptionIds: ['A', 'B'],
        points: 2,
        topic: 'Аравтын бутархай',
      },
      {
        order: 3,
        type: 'truefalse',
        text: '25% нь 1/4-тэй тэнцүү.',
        correctOptionIds: ['A'],
        points: 1,
        topic: 'Хувь',
      },
      {
        order: 4,
        type: 'short',
        text: '80-ийн 25% хэд вэ?',
        acceptedAnswers: ['20'],
        points: 1,
        topic: 'Хувь',
      },
    ],
    ...overrides,
  };
}

/** Бүх зөв хариулт (нийт 5 оноо). */
function perfectAnswers(questionIds: string[]) {
  return [
    { questionId: questionIds[0]!, value: 'A' },
    { questionId: questionIds[1]!, value: ['A', 'B'] },
    { questionId: questionIds[2]!, value: true },
    { questionId: questionIds[3]!, value: ' 20. ' },
  ];
}

function submissionPayload(questionIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    mode: 'pre',
    lastName: 'Дорж',
    firstName: 'Ану',
    className: '8а',
    answers: perfectAnswers(questionIds),
    startedAt: '2026-03-02T01:00:00.000Z',
    submittedAt: '2026-03-02T01:07:00.000Z',
    durationSec: 420,
    deviceId: 'test-device',
    source: 'online',
    ...overrides,
  };
}

async function createExam(overrides: Record<string, unknown> = {}) {
  const response = await admin.post('/api/exams').send(examPayload(overrides));
  expect(response.status).toBe(201);
  const exam = response.body.exam as {
    id: string;
    teacherToken: string;
    questions: { id: string; order: number }[];
  };
  const questionIds = exam.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => question.id);
  return { exam, questionIds };
}

beforeAll(async () => {
  prisma = createPrismaClient(TEST_DATABASE_URL);
  app = createApp(prisma);

  // Эхний админ данс — CLI-гүйгээр шууд үүсгэнэ
  await createUser(prisma, {
    username: 'testadmin',
    fullName: 'Тест админ',
    role: 'admin',
    password: 'TempAdmin!1',
  });

  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'testadmin', password: 'TempAdmin!1' });
  // Түр нууц үгээ солино — эс бөгөөс бусад үйлдэл 403 буцна
  const changed = await admin
    .post('/api/auth/password')
    .send({ currentPassword: 'TempAdmin!1', newPassword: ADMIN_PASSWORD });
  expect(changed.status).toBe(200);

  const raw = changed.headers['set-cookie'];
  adminCookie = Array.isArray(raw) ? raw : raw ? [raw] : [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ===========================================================================

describe('GET /api/health', () => {
  it('ok буцаана', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('ok');
  });
});

describe('POST /api/exams', () => {
  it('шалгалт үүсгээд 32 тэмдэгтийн teacherToken буцаана', async () => {
    const { exam } = await createExam();
    expect(exam.id).toHaveLength(12);
    expect(exam.teacherToken).toHaveLength(32);
    expect(exam.questions).toHaveLength(4);
  });

  it('truefalse асуултад Үнэн/Худал сонголтыг автоматаар нэмнэ', async () => {
    const { exam } = await createExam();
    const trueFalse = exam.questions.find((q) => q.order === 3) as unknown as {
      options: { id: string; text: string }[];
    };
    expect(trueFalse.options).toEqual([
      { id: 'A', text: 'Үнэн' },
      { id: 'B', text: 'Худал' },
    ]);
  });

  it('буруу өгөгдөлд 400 + монгол алдааны мессеж', async () => {
    const response = await admin
      .post('/api/exams')
      .send(examPayload({ teacherEmail: 'муу-имэйл' }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('Имэйл');
  });

  it('single төрөлд олон зөв хариулт өгвөл татгалзана', async () => {
    const payload = examPayload();
    (payload.questions[0] as { correctOptionIds: string[] }).correctOptionIds = ['A', 'B'];
    const response = await admin.post('/api/exams').send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('single');
  });

  it('оноо 0.5-ийн алхамгүй бол татгалзана', async () => {
    const payload = examPayload();
    (payload.questions[0] as { points: number }).points = 1.3;
    const response = await admin.post('/api/exams').send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('0.5');
  });
});

describe('DELETE /api/exams/:id', () => {
  it('зөвхөн багшийн токеноор шалгалтыг устгана', async () => {
    const { exam } = await createExam();
    const denied = await request(app).delete(`/api/exams/${exam.id}`).query({ t: 'wrong-token' });
    expect(denied.status).toBe(401);

    const deleted = await request(app)
      .delete(`/api/exams/${exam.id}`)
      .query({ t: exam.teacherToken });
    expect(deleted.status).toBe(204);

    const missing = await request(app).get(`/api/exams/${exam.id}`);
    expect(missing.status).toBe(404);
  });
});

describe('GET /api/exams/:id — токенгүй/токентой', () => {
  it('токенгүй үед зөв хариулт БАЙХГҮЙ', async () => {
    const { exam } = await createExam();
    const response = await request(app).get(`/api/exams/${exam.id}`);
    expect(response.status).toBe(200);
    expect(response.body.isTeacher).toBe(false);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('correctOptionIds');
    expect(serialized).not.toContain('acceptedAnswers');
    expect(serialized).not.toContain('teacherToken');
    expect(serialized).not.toContain('bagsh@example.mn');
  });

  it('токентой үед бүрэн өгөгдөл + тоо', async () => {
    const { exam } = await createExam();
    const response = await request(app).get(`/api/exams/${exam.id}?t=${exam.teacherToken}`);
    expect(response.status).toBe(200);
    expect(response.body.isTeacher).toBe(true);
    expect(response.body.exam.questions[0].correctOptionIds).toEqual(['A']);
    expect(response.body.counts).toEqual({ pre: 0, post: 0 });
  });

  it('буруу токен бол сурагчийн хувилбарыг буцаана', async () => {
    const { exam } = await createExam();
    const response = await request(app).get(`/api/exams/${exam.id}?t=${'x'.repeat(32)}`);
    expect(response.status).toBe(200);
    expect(response.body.isTeacher).toBe(false);
  });

  it('байхгүй шалгалтад 404', async () => {
    const response = await request(app).get('/api/exams/aaaaaaaaaaaa');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Багшийн токен шаардах route-ууд', () => {
  it('токенгүй бол 401', async () => {
    const { exam } = await createExam();
    const response = await request(app).get(`/api/exams/${exam.id}/submissions`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('буруу токен бол 401', async () => {
    const { exam } = await createExam();
    const response = await request(app)
      .get(`/api/exams/${exam.id}/submissions`)
      .set('Authorization', `Bearer ${'y'.repeat(32)}`);
    expect(response.status).toBe(401);
  });

  it('Bearer толгойгоор ч ажиллана', async () => {
    const { exam } = await createExam();
    const response = await request(app)
      .get(`/api/exams/${exam.id}/submissions`)
      .set('Authorization', `Bearer ${exam.teacherToken}`);
    expect(response.status).toBe(200);
  });
});

describe('POST /api/exams/:id/submissions — оноолт', () => {
  it('бүх зөв → 100%, сервер дахин оноолно', async () => {
    const { exam, questionIds } = await createExam();
    const response = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    expect(response.status).toBe(201);
    const submission = response.body.submission;
    expect(submission.score).toBe(5);
    expect(submission.maxScore).toBe(5);
    expect(submission.percent).toBe(100);
    expect(submission.passed).toBe(true);
    expect(submission.studentKey).toBe(computeStudentKey('Дорж', 'Ану', '8а'));
  });

  it('multi-д нэг зөв дутуу бол 0 оноо (хэсэгчилсэн оноо байхгүй)', async () => {
    const { exam, questionIds } = await createExam();
    const answers = perfectAnswers(questionIds);
    answers[1] = { questionId: questionIds[1]!, value: ['A'] };

    const response = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { answers }));

    expect(response.status).toBe(201);
    expect(response.body.submission.score).toBe(3); // 1 + 0 + 1 + 1
    expect(response.body.submission.percent).toBe(60);
    expect(response.body.submission.passed).toBe(true);
  });

  it('short хариултыг нормчилж харьцуулна', async () => {
    const { exam, questionIds } = await createExam();
    const answers = perfectAnswers(questionIds);
    answers[3] = { questionId: questionIds[3]!, value: '  20  ' };

    const response = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { answers }));
    expect(response.body.submission.score).toBe(5);
  });

  it('нэг сурагч нэг горимд дахин өгвөл 409 + өмнөх дүн', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const second = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { answers: [] }));

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
    expect(second.body.percent).toBe(100); // өмнөх дүнг харуулна
  });

  it('нэр/анги ижил бол том-жижиг үсэг, зайнаас үл хамааран нэг сурагч', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const second = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(
        submissionPayload(questionIds, { lastName: '  ДОРЖ ', firstName: 'ану', className: '8А' }),
      );
    expect(second.status).toBe(409);
  });

  it('шалгалтын горимтой таарахгүй бол 409', async () => {
    const { exam, questionIds } = await createExam();
    const response = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { mode: 'post' }));
    expect(response.status).toBe(409);
    expect(response.body.error.details.currentMode).toBe('pre');
  });

  it('studentKey нэртэй тохирохгүй бол 400', async () => {
    const { exam, questionIds } = await createExam();
    const response = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { studentKey: 'a'.repeat(64) }));
    expect(response.status).toBe(400);
  });
});

describe('Горим солих', () => {
  it('pre → post, өмнөх тоог буцаана', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const response = await request(app)
      .post(`/api/exams/${exam.id}/mode?t=${exam.teacherToken}`)
      .send({ mode: 'post' });

    expect(response.status).toBe(200);
    expect(response.body.exam.mode).toBe('post');
    expect(response.body.preCount).toBe(1);
  });

  it('дахин солих боломжгүй (post → pre)', async () => {
    const { exam } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/mode?t=${exam.teacherToken}`)
      .send({ mode: 'post' });

    const second = await request(app)
      .post(`/api/exams/${exam.id}/mode?t=${exam.teacherToken}`)
      .send({ mode: 'post' });
    expect(second.status).toBe(409);
  });

  it('горим сольсны дараа ижил сурагч post өгч чадна', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));
    await request(app)
      .post(`/api/exams/${exam.id}/mode?t=${exam.teacherToken}`)
      .send({ mode: 'post' });

    const post = await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds, { mode: 'post' }));
    expect(post.status).toBe(201);
  });
});

describe('GET /api/exams/:id/submissions/mine', () => {
  it('сурагч өөрийн pre дүнгээ авна', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const key = computeStudentKey('Дорж', 'Ану', '8а');
    const response = await request(app)
      .get(`/api/exams/${exam.id}/submissions/mine`)
      .query({ studentKey: key, mode: 'pre' });

    expect(response.status).toBe(200);
    expect(response.body.submissions).toHaveLength(1);
    expect(response.body.submissions[0].percent).toBe(100);
  });

  it('буруу форматтай studentKey бол 400', async () => {
    const { exam } = await createExam();
    const response = await request(app)
      .get(`/api/exams/${exam.id}/submissions/mine`)
      .query({ studentKey: 'богино' });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/sync', () => {
  it('багц илгээлтийг хадгална', async () => {
    const { exam, questionIds } = await createExam();

    const records = ['Бат', 'Болд', 'Гэрэл'].map((lastName, index) => ({
      id: `local-${index}`,
      entity: 'submission' as const,
      examId: exam.id,
      payload: submissionPayload(questionIds, { lastName, firstName: 'Сурагч' }),
    }));

    const response = await request(app).post('/api/sync').send({ deviceId: 'd1', records });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(3);
    expect(response.body.duplicate).toBe(0);
    expect(response.body.error).toBe(0);
    expect(response.body.results.map((r: { id: string }) => r.id)).toEqual([
      'local-0',
      'local-1',
      'local-2',
    ]);
  });

  it('давхардсаныг duplicate гэж тэмдэглэж, conflict жагсаалтад нэмнэ', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const response = await request(app)
      .post('/api/sync')
      .send({
        deviceId: 'd2',
        records: [
          {
            id: 'local-dup',
            entity: 'submission',
            examId: exam.id,
            payload: submissionPayload(questionIds, { answers: [] }),
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(1);

    const list = await request(app).get(`/api/exams/${exam.id}/submissions?t=${exam.teacherToken}`);
    // Тайлангийн тоололд conflict орохгүй
    expect(list.body.submissions).toHaveLength(1);
    expect(list.body.conflicts).toHaveLength(1);
    expect(list.body.conflicts[0].syncStatus).toBe('conflict');
  });

  it('байхгүй шалгалтад error гэж буцаана (бусад бичлэг үргэлжилнэ)', async () => {
    const { exam, questionIds } = await createExam();
    const response = await request(app)
      .post('/api/sync')
      .send({
        records: [
          {
            id: 'bad',
            entity: 'submission',
            examId: 'zzzzzzzzzzzz',
            payload: submissionPayload(questionIds),
          },
          {
            id: 'good',
            entity: 'submission',
            examId: exam.id,
            payload: submissionPayload(questionIds, { lastName: 'Ганбат' }),
          },
        ],
      });

    expect(response.body.error).toBe(1);
    expect(response.body.ok).toBe(1);
  });

  it('100-аас олон бичлэг татгалзана', async () => {
    const { exam, questionIds } = await createExam();
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `x-${index}`,
      entity: 'submission' as const,
      examId: exam.id,
      payload: submissionPayload(questionIds),
    }));
    const response = await request(app).post('/api/sync').send({ records });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('100');
  });
});

describe('Тайлан', () => {
  const stats = {
    nPre: 1,
    nPost: 1,
    nPaired: 1,
    meanAbsGain: 25,
    conclusions: {
      overall: 'Тест',
      bestTopic: '',
      weakTopic: '',
      attentionStudents: '',
      recommendations: [],
    },
  };

  it('stats + docx хадгална, дараа нь татаж болно', async () => {
    const { exam } = await createExam();

    const created = await request(app)
      .post(`/api/exams/${exam.id}/reports?t=${exam.teacherToken}`)
      .field('stats', JSON.stringify(stats))
      .attach('docx', Buffer.from('PK жишээ docx агуулга'), 'report.docx');

    expect(created.status).toBe(201);
    expect(created.body.report.docxUrl).toContain('/download');

    const download = await request(app).get(
      `/api/reports/${created.body.report.id}/download?t=${exam.teacherToken}`,
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('wordprocessingml');
  });

  it('нэвтэрсэн эзэмшигч ТОКЕНГҮЙГЭЭР тайлангаа татна', async () => {
    // `/api/reports/*` дээр сесс таних middleware дутуу байсан алдааг барина
    const { agent } = await newTeacherAgent('report.session');
    const created = await agent.post('/api/exams').send(examPayload());
    const examId = created.body.exam.id as string;

    const report = await agent
      .post(`/api/exams/${examId}/reports`)
      .field('stats', JSON.stringify(stats))
      .attach('docx', Buffer.from('PK жишээ'), 'report.docx');
    expect(report.status).toBe(201);

    const reportId = report.body.report.id as string;

    // Токенгүйгээр — зөвхөн сессээр
    expect((await agent.get(`/api/reports/${reportId}`)).status).toBe(200);

    const download = await agent.get(`/api/reports/${reportId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('wordprocessingml');

    // Өөр багш хандаж чадахгүй
    const stranger = await newTeacherAgent('report.stranger');
    expect((await stranger.agent.get(`/api/reports/${reportId}/download`)).status).toBe(403);
  });

  it('docx-гүйгээр зөвхөн статистик хадгална', async () => {
    const { exam } = await createExam();
    const created = await request(app)
      .post(`/api/exams/${exam.id}/reports?t=${exam.teacherToken}`)
      .field('stats', JSON.stringify(stats));
    expect(created.status).toBe(201);
    expect(created.body.report.docxUrl).toBeUndefined();
  });

  it('токенгүй бол 401', async () => {
    const { exam } = await createExam();
    const response = await request(app)
      .post(`/api/exams/${exam.id}/reports`)
      .field('stats', JSON.stringify(stats));
    expect(response.status).toBe(401);
  });

  it('өөр багшийн имэйл рүү илгээхийг татгалзана', async () => {
    const { exam } = await createExam();
    const created = await request(app)
      .post(`/api/exams/${exam.id}/reports?t=${exam.teacherToken}`)
      .field('stats', JSON.stringify(stats));

    const response = await request(app)
      .post(`/api/reports/${created.body.report.id}/email?t=${exam.teacherToken}`)
      .send({ to: 'attacker@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('багшийн имэйл');
  });
});

describe('CSV экспорт', () => {
  it('BOM-той, цэг таслалаар зааглагдсан, кирилл толгойтой', async () => {
    const { exam, questionIds } = await createExam();
    await request(app)
      .post(`/api/exams/${exam.id}/submissions`)
      .send(submissionPayload(questionIds));

    const response = await request(app).get(
      `/api/exams/${exam.id}/export.csv?t=${exam.teacherToken}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text.startsWith('﻿')).toBe(true);
    expect(response.text).toContain('Овог;Нэр;Анги');
    expect(response.text).toContain('Дорж;Ану;8а');
  });
});

// ===========================================================================
// Нэвтрэлт ба эрх
// ===========================================================================

describe('Нэвтрэлт', () => {
  it('нэвтрээгүй үед /me нь null буцаана', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
    // Админ аль хэдийн үүссэн тул setup шаардлагагүй
    expect(response.body.needsSetup).toBe(false);
  });

  it('нэвтэрсэн үед өөрийн мэдээллийг буцаана', async () => {
    const response = await admin.get('/api/auth/me');
    expect(response.body.user.username).toBe('testadmin');
    expect(response.body.user.role).toBe('admin');
    // Нууц үгийн хэш ХЭЗЭЭ Ч гадагш гарахгүй
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('passwordSalt');
  });

  it('буруу нууц үгээр нэвтэрч чадахгүй', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'буруу-нууц-үг' });
    expect(response.status).toBe(401);
  });

  it('байхгүй хэрэглэгчээр нэвтэрч чадахгүй', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'байхгүй.хүн', password: 'ямар нэг' });
    expect(response.status).toBe(401);
    // "Ийм нэр байхгүй" гэж хэлэхгүй — нэр таах боломж өгөхгүй
    expect(response.body.error.message).toContain('нэр эсвэл нууц үг');
  });

  it('гарсны дараа сесс хүчингүй болно', async () => {
    const agent = request.agent(app);
    await createUser(prisma, {
      username: 'logout.test',
      fullName: 'Гарах тест',
      role: 'teacher',
      password: 'LogoutTest!1',
    });
    await agent.post('/api/auth/login').send({ username: 'logout.test', password: 'LogoutTest!1' });
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull();

    await agent.post('/api/auth/logout').send({});
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('түр нууц үгтэй хэрэглэгч шалгалт үүсгэж чадахгүй', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'pending.pass', fullName: 'Хүлээгдэж буй', role: 'teacher' });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'pending.pass', password: created.body.tempPassword });

    const response = await agent.post('/api/exams').send(examPayload());
    expect(response.status).toBe(403);
    expect(response.body.error.details.mustChangePassword).toBe(true);
  });

  it('нууц үг сольсны дараа ажиллана', async () => {
    const { agent } = await newTeacherAgent('works.after');
    const response = await agent.post('/api/exams').send(examPayload());
    expect(response.status).toBe(201);
  });
});

describe('Эрхийн тусгаарлалт', () => {
  it('багш зөвхөн ӨӨРИЙН шалгалтыг хардаг', async () => {
    const first = await newTeacherAgent('isolate.one');
    const second = await newTeacherAgent('isolate.two');

    const created = await first.agent
      .post('/api/exams')
      .send(examPayload({ title: 'Нэгдүгээрийнх' }));
    expect(created.status).toBe(201);

    const mine = await first.agent.get('/api/exams');
    expect(mine.body.exams.some((item: { id: string }) => item.id === created.body.exam.id)).toBe(
      true,
    );

    const theirs = await second.agent.get('/api/exams');
    expect(theirs.body.exams.some((item: { id: string }) => item.id === created.body.exam.id)).toBe(
      false,
    );
  });

  it('өөр багшийн шалгалтад хандаж чадахгүй', async () => {
    const owner = await newTeacherAgent('owner.only');
    const stranger = await newTeacherAgent('stranger.only');

    const created = await owner.agent.post('/api/exams').send(examPayload());
    const examId = created.body.exam.id as string;

    expect((await stranger.agent.get(`/api/exams/${examId}/submissions`)).status).toBe(403);
    expect(
      (await stranger.agent.post(`/api/exams/${examId}/mode`).send({ mode: 'post' })).status,
    ).toBe(403);
    expect((await stranger.agent.delete(`/api/exams/${examId}`)).status).toBe(403);
  });

  it('админ бүх шалгалтад хандана', async () => {
    const owner = await newTeacherAgent('admin.sees');
    const created = await owner.agent.post('/api/exams').send(examPayload());
    const examId = created.body.exam.id as string;

    expect((await admin.get(`/api/exams/${examId}/submissions`)).status).toBe(200);
  });

  it('багш админы route руу орж чадахгүй', async () => {
    const { agent } = await newTeacherAgent('not.admin');
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.get('/api/admin/overview')).status).toBe(403);
    expect(
      (await agent.post('/api/admin/users').send({ username: 'x.y', fullName: 'X' })).status,
    ).toBe(403);
  });

  it('нэвтрээгүй хүн шалгалт үүсгэж чадахгүй', async () => {
    const response = await request(app).post('/api/exams').send(examPayload());
    expect(response.status).toBe(401);
  });

  it('хуваалцах токеноор эрх олгогдоно (нэвтрэлтгүй ч)', async () => {
    const { exam } = await createExam();
    const response = await request(app).get(
      `/api/exams/${exam.id}/submissions?t=${exam.teacherToken}`,
    );
    expect(response.status).toBe(200);
  });
});

describe('Админы хэрэглэгчийн удирдлага', () => {
  it('багшийн данс нээж түр нууц үг буцаана', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'new.teacher', fullName: 'Шинэ Багш', email: 'new@school.mn' });

    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe('new.teacher');
    expect(response.body.user.role).toBe('teacher');
    expect(response.body.user.mustChangePassword).toBe(true);
    expect(typeof response.body.tempPassword).toBe('string');
    expect(response.body.tempPassword.length).toBeGreaterThanOrEqual(8);
  });

  it('давхардсан нэвтрэх нэрийг татгалзана', async () => {
    await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'dup.name', fullName: 'Анхных' });

    const second = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'DUP.NAME', fullName: 'Хоёр дахь' });

    expect(second.status).toBe(409);
  });

  it('буруу форматтай нэвтрэх нэрийг татгалзана', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'багш нэр', fullName: 'Кирилл нэр' });
    expect(response.status).toBe(400);
  });

  it('нууц үг сэргээхэд хуучин сесс хүчингүй болно', async () => {
    const { agent, userId } = await newTeacherAgent('reset.session');
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull();

    const reset = await request(app)
      .post(`/api/admin/users/${userId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({});
    expect(reset.status).toBe(200);

    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('идэвхгүй болгосон данс нэвтэрч чадахгүй', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'to.disable', fullName: 'Идэвхгүй болох' });

    await request(app)
      .patch(`/api/admin/users/${created.body.user.id}`)
      .set('Cookie', adminCookie)
      .send({ isActive: false });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'to.disable', password: created.body.tempPassword });

    expect(response.status).toBe(403);
  });

  it('сүүлийн админыг идэвхгүй болгож чадахгүй', async () => {
    const me = await admin.get('/api/auth/me');
    const response = await request(app)
      .patch(`/api/admin/users/${me.body.user.id}`)
      .set('Cookie', adminCookie)
      .send({ isActive: false });
    expect(response.status).toBe(400);
  });

  it('шалгалттай багшийг устгаж чадахгүй', async () => {
    const { agent, userId } = await newTeacherAgent('has.exams');
    await agent.post('/api/exams').send(examPayload());

    const response = await request(app)
      .delete(`/api/admin/users/${userId}`)
      .set('Cookie', adminCookie);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('идэвхгүй');
  });

  it('шалгалтгүй багшийг устгана', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .set('Cookie', adminCookie)
      .send({ username: 'no.exams', fullName: 'Шалгалтгүй' });

    const response = await request(app)
      .delete(`/api/admin/users/${created.body.user.id}`)
      .set('Cookie', adminCookie);
    expect(response.status).toBe(204);
  });

  it('тойм тоо буцаана', async () => {
    const response = await admin.get('/api/admin/overview');
    expect(response.status).toBe(200);
    expect(response.body.admins).toBeGreaterThanOrEqual(1);
    expect(typeof response.body.exams).toBe('number');
  });
});

describe('Алдааны нэгдсэн хэлбэр', () => {
  it('байхгүй зам → 404 { error: { code, message } }', async () => {
    const response = await request(app).get('/api/байхгүй');
    expect(response.status).toBe(404);
    expect(response.body.error).toHaveProperty('code');
    expect(response.body.error).toHaveProperty('message');
  });
});
