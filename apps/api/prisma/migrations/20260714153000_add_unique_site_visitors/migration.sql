CREATE TABLE "UniqueSiteVisitor" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniqueSiteVisitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UniqueSiteVisitor_ipHash_key" ON "UniqueSiteVisitor"("ipHash");

CREATE INDEX "UniqueSiteVisitor_lastSeenAt_idx" ON "UniqueSiteVisitor"("lastSeenAt");
