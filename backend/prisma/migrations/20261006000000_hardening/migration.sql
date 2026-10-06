-- Additive upgrade from init and legacy db-push installations.
-- Existing columns remain intact; baseline verification is required for legacy databases.
BEGIN;
-- AlterTable
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "encryptionIndex" INTEGER,
ADD COLUMN IF NOT EXISTS "relativePath" TEXT,
ADD COLUMN IF NOT EXISTS "storedSize" BIGINT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "encrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "encryptionContext" TEXT,
ADD COLUMN IF NOT EXISTS "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "virusScanned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT,
ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
ADD COLUMN IF NOT EXISTS "storageReserved" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "totpPendingExpiry" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "totpPendingSecret" TEXT,
ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Log" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ip" TEXT,
    "userId" TEXT,
    "meta" JSONB,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Log_createdAt_idx" ON "Log"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Log_level_idx" ON "Log"("level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Log_category_idx" ON "Log"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_kind_status_expiresAt_idx" ON "Job"("kind", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_passwordResetToken_idx" ON "User"("passwordResetToken");


COMMIT;
