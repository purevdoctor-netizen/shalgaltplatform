-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'teacher',
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "lastLoginAt" TEXT,
    "createdById" TEXT
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "lastSeenAt" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "teacherEmail" TEXT NOT NULL,
    "ownerId" TEXT,
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
    "onePerPage" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "exams_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exams" ("createdAt", "deliveryMode", "durationMin", "examDate", "id", "mode", "onePerPage", "passThreshold", "showAnswersToStudent", "shuffle", "status", "subject", "teacherEmail", "teacherName", "teacherToken", "title", "updatedAt") SELECT "createdAt", "deliveryMode", "durationMin", "examDate", "id", "mode", "onePerPage", "passThreshold", "showAnswersToStudent", "shuffle", "status", "subject", "teacherEmail", "teacherName", "teacherToken", "title", "updatedAt" FROM "exams";
DROP TABLE "exams";
ALTER TABLE "new_exams" RENAME TO "exams";
CREATE UNIQUE INDEX "exams_teacherToken_key" ON "exams"("teacherToken");
CREATE INDEX "exams_status_idx" ON "exams"("status");
CREATE INDEX "exams_ownerId_idx" ON "exams"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
