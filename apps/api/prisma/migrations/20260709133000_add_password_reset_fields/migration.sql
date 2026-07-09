ALTER TABLE "User"
ADD COLUMN "passwordResetCodeHash" TEXT,
ADD COLUMN "passwordResetCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3),
ADD COLUMN "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0;
