ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "activationTokenHash" TEXT,
ADD COLUMN "activationTokenExpiresAt" TIMESTAMP(3);

UPDATE "User"
SET "activatedAt" = COALESCE("activatedAt", "createdAt")
WHERE "isActive" = true;

ALTER TABLE "User"
ALTER COLUMN "isActive" SET DEFAULT false;
