-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "teacherEmail" TEXT NOT NULL,
    "teacherToken" TEXT NOT NULL,
    "examDate" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'pre',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deliveryMode" TEXT NOT NULL DEFAULT 'online',
    "passThreshold" REAL NOT NULL DEFAULT 60,
    "durationMin" INTEGER,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "showAnswersToStudent" BOOLEAN NOT NULL DEFAULT true,
    "onePerPage" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "optionsJson" TEXT,
    "correctOptionIdsJson" TEXT,
    "acceptedAnswersJson" TEXT,
    "points" REAL NOT NULL DEFAULT 1,
    "topic" TEXT,
    CONSTRAINT "questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "studentKey" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "answersJson" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "maxScore" REAL NOT NULL,
    "percent" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "startedAt" TEXT NOT NULL,
    "submittedAt" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'online',
    "syncStatus" TEXT NOT NULL DEFAULT 'synced',
    "conflictOfId" TEXT,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "submissions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "generatedAt" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL,
    "docxFileName" TEXT,
    "docxSize" INTEGER,
    "emailStatus" TEXT NOT NULL DEFAULT 'pending',
    "emailError" TEXT,
    "emailSentAt" TEXT,
    CONSTRAINT "reports_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "email_queue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_queue_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "deviceId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_teacherToken_key" ON "exams"("teacherToken");

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "questions_examId_idx" ON "questions"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "questions_examId_order_key" ON "questions"("examId", "order");

-- CreateIndex
CREATE INDEX "submissions_examId_mode_idx" ON "submissions"("examId", "mode");

-- CreateIndex
CREATE INDEX "submissions_studentKey_idx" ON "submissions"("studentKey");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_examId_mode_studentKey_key" ON "submissions"("examId", "mode", "studentKey");

-- CreateIndex
CREATE INDEX "reports_examId_idx" ON "reports"("examId");

-- CreateIndex
CREATE INDEX "email_queue_status_idx" ON "email_queue"("status");

-- CreateIndex
CREATE INDEX "sync_log_createdAt_idx" ON "sync_log"("createdAt");
