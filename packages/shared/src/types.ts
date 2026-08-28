/**
 * Клиент болон сервер хоёулаа ашигладаг үндсэн төрлүүд.
 * Prisma schema энэ файлтай 1:1 тохирно (`answers`, `stats` → Json).
 */

export type UserRole = 'admin' | 'teacher';

/** Хэрэглэгчийн нийтэд харагдах мэдээлэл (нууц үгийн хэш ХЭЗЭЭ Ч орохгүй). */
export interface User {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  /** Админд харагдах нэмэлт: тухайн багшийн үүсгэсэн шалгалтын тоо. */
  examCount?: number;
}

export type ExamMode = 'pre' | 'post';
export type ExamStatus = 'draft' | 'active' | 'closed';
export type DeliveryMode = 'online' | 'lan' | 'offlineQr';
export type QuestionType = 'single' | 'multi' | 'truefalse' | 'short';
export type SyncStatus = 'pending' | 'synced' | 'conflict';

export interface Exam {
  id: string;
  title: string;
  subject: string;
  teacherName: string;
  teacherEmail: string;
  teacherToken: string;
  /** Эзэмшигч багшийн id. Хуучин өгөгдөлд байхгүй байж болно. */
  ownerId?: string;
  examDate: string;
  createdAt: string;
  updatedAt: string;
  mode: ExamMode;
  status: ExamStatus;
  deliveryMode: DeliveryMode;
  passThreshold: number;
  durationMin?: number;
  shuffle: boolean;
  showAnswersToStudent: boolean;
  onePerPage: boolean;
  questions: Question[];
}

export interface Question {
  id: string;
  examId: string;
  order: number;
  type: QuestionType;
  text: string;
  options?: { id: string; text: string }[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  points: number;
  topic?: string;
}

export type AnswerValue = string | string[] | boolean | null;

export interface Submission {
  id: string;
  examId: string;
  mode: ExamMode;
  studentKey: string;
  lastName: string;
  firstName: string;
  className: string;
  answers: { questionId: string; value: AnswerValue }[];
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string;
  durationSec: number;
  deviceId: string;
  source: 'online' | 'lan' | 'answerQr' | 'manualCode';
  syncStatus: SyncStatus;
}

export interface StudentResult {
  studentKey: string;
  lastName: string;
  firstName: string;
  className: string;
  prePercent: number | null;
  postPercent: number | null;
  absGain: number | null;
  normGain: number | null;
  category: 'high' | 'medium' | 'low' | 'declined' | 'preOnly' | 'postOnly';
}

export interface ItemStat {
  questionId: string;
  order: number;
  topic?: string;
  preCorrectPct: number | null;
  postCorrectPct: number | null;
  gain: number | null;
}

export interface GroupStats {
  n: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  passRate: number;
}

export interface ReportStats {
  nPre: number;
  nPost: number;
  nPaired: number;
  pre: GroupStats | null;
  post: GroupStats | null;
  meanAbsGain: number | null;
  meanNormGain: number | null;
  hakeGain: number | null;
  tStat: number | null;
  pValue: number | null;
  cohenD: number | null;
  lowSampleWarning: boolean;
  items: ItemStat[];
  topImproved: ItemStat[];
  leastImproved: ItemStat[];
  topics: { topic: string; gain: number; nItems: number }[];
  students: StudentResult[];
  categoryCounts: Record<StudentResult['category'], number>;
  conclusions: {
    overall: string;
    bestTopic: string;
    weakTopic: string;
    attentionStudents: string;
    recommendations: string[];
  };
}

export interface Report {
  id: string;
  examId: string;
  generatedAt: string;
  stats: ReportStats;
  docxBlobId?: string;
  docxUrl?: string;
  emailStatus: 'pending' | 'sent' | 'failed';
  emailError?: string;
  emailSentAt?: string;
}

export interface EmailQueueItem {
  id: string;
  reportId: string;
  examId: string;
  to: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'sent' | 'failed';
}

// ---------------------------------------------------------------------------
// Туслах төрлүүд (дээрх үндсэн бүтцийг өөрчлөхгүй, зөвхөн нэмэлт)
// ---------------------------------------------------------------------------

/** Оноолтын үр дүн — `scoreAnswers()` буцаана. */
export interface QuestionScore {
  questionId: string;
  order: number;
  type: QuestionType;
  answered: boolean;
  correct: boolean;
  points: number;
  earned: number;
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  perQuestion: QuestionScore[];
}

/** Сурагчийн ангиллын нэрийн монгол орчуулга (тайлан, UI-д ашиглана). */
export const CATEGORY_LABELS_MN: Record<StudentResult['category'], string> = {
  high: 'Өндөр ахиц',
  medium: 'Дундаж',
  low: 'Бага',
  declined: 'Буурсан',
  preOnly: 'Зөвхөн өмнөх',
  postOnly: 'Зөвхөн дараах',
};

/** Cohen's d-ийн үр нөлөөний хэмжээний тайлбар. */
export type EffectSizeLabel = 'маш бага' | 'бага' | 'дундаж' | 'их';
