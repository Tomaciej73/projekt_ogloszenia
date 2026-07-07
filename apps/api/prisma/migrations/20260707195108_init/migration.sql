-- CreateEnum
CREATE TYPE "ListingDraftStatus" AS ENUM ('draft', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "ExternalListingStatus" AS ENUM ('queued', 'publishing', 'published', 'failed', 'requires_action', 'expired', 'sold', 'deleted', 'unsupported');

-- CreateEnum
CREATE TYPE "PublicationJobStatus" AS ENUM ('pending', 'processing', 'success', 'failed', 'retrying', 'cancelled');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('official_api', 'partner_api_required', 'pro_account_required', 'manual_export_only', 'unsupported', 'research_required');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingDraft" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "category" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "location" JSONB NOT NULL DEFAULT '{}',
    "status" "ListingDraftStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "ListingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingDraftId" TEXT NOT NULL,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAccount" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "marketplaceProviderId" TEXT NOT NULL,

    CONSTRAINT "MarketplaceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalListing" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "status" "ExternalListingStatus" NOT NULL DEFAULT 'queued',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingDraftId" TEXT NOT NULL,
    "marketplaceProviderId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT NOT NULL,

    CONSTRAINT "ExternalListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationJob" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PublicationJobStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingDraftId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT NOT NULL,
    "externalListingId" TEXT NOT NULL,

    CONSTRAINT "PublicationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicationJobId" TEXT NOT NULL,
    "externalListingId" TEXT NOT NULL,

    CONSTRAINT "PublicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" TEXT NOT NULL,
    "internalCategory" TEXT NOT NULL,
    "providerCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceProviderId" TEXT NOT NULL,

    CONSTRAINT "CategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeMapping" (
    "id" TEXT NOT NULL,
    "internalAttribute" TEXT NOT NULL,
    "providerAttribute" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceProviderId" TEXT NOT NULL,

    CONSTRAINT "AttributeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProvider_name_key" ON "MarketplaceProvider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProvider_slug_key" ON "MarketplaceProvider"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAccount_userId_marketplaceProviderId_key" ON "MarketplaceAccount"("userId", "marketplaceProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalListing_listingDraftId_marketplaceProviderId_key" ON "ExternalListing"("listingDraftId", "marketplaceProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationJob_idempotencyKey_key" ON "PublicationJob"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_marketplaceProviderId_internalCategory_key" ON "CategoryMapping"("marketplaceProviderId", "internalCategory");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeMapping_marketplaceProviderId_internalAttribute_key" ON "AttributeMapping"("marketplaceProviderId", "internalAttribute");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingDraftId_fkey" FOREIGN KEY ("listingDraftId") REFERENCES "ListingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAccount" ADD CONSTRAINT "MarketplaceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAccount" ADD CONSTRAINT "MarketplaceAccount_marketplaceProviderId_fkey" FOREIGN KEY ("marketplaceProviderId") REFERENCES "MarketplaceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalListing" ADD CONSTRAINT "ExternalListing_listingDraftId_fkey" FOREIGN KEY ("listingDraftId") REFERENCES "ListingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalListing" ADD CONSTRAINT "ExternalListing_marketplaceProviderId_fkey" FOREIGN KEY ("marketplaceProviderId") REFERENCES "MarketplaceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalListing" ADD CONSTRAINT "ExternalListing_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_listingDraftId_fkey" FOREIGN KEY ("listingDraftId") REFERENCES "ListingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_externalListingId_fkey" FOREIGN KEY ("externalListingId") REFERENCES "ExternalListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationEvent" ADD CONSTRAINT "PublicationEvent_publicationJobId_fkey" FOREIGN KEY ("publicationJobId") REFERENCES "PublicationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationEvent" ADD CONSTRAINT "PublicationEvent_externalListingId_fkey" FOREIGN KEY ("externalListingId") REFERENCES "ExternalListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMapping" ADD CONSTRAINT "CategoryMapping_marketplaceProviderId_fkey" FOREIGN KEY ("marketplaceProviderId") REFERENCES "MarketplaceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeMapping" ADD CONSTRAINT "AttributeMapping_marketplaceProviderId_fkey" FOREIGN KEY ("marketplaceProviderId") REFERENCES "MarketplaceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
