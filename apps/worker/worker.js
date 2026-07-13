const { Queue, Worker } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { sanitizeAuditMetadata } = require("@multiportal/shared/audit-metadata");
const { config } = require("./runtime-config");

const REDIS_URL = config.REDIS_URL;
const pool = new Pool({ connectionString: config.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const publicationQueue = new Queue("publication", {
  connection: { url: REDIS_URL },
});

async function writeAuditLog(tx, { userId, action, entityType, entityId, metadata = {} }) {
  await tx.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      metadata: sanitizeAuditMetadata(metadata) || {},
    },
  });
}

async function loadPublicationJob(tx, publicationJobId) {
  return tx.publicationJob.findUnique({
    where: { id: publicationJobId },
    include: {
      listingDraft: { select: { id: true, userId: true } },
      externalListing: { select: { id: true } },
    },
  });
}

async function markPublicationProcessing(publicationJobId, attemptNumber) {
  return prisma.$transaction(async (tx) => {
    const publicationJob = await loadPublicationJob(tx, publicationJobId);
    if (!publicationJob) throw new Error("Publication job was not found.");

    const now = new Date();
    await tx.publicationJob.update({
      where: { id: publicationJob.id },
      data: {
        status: "processing",
        attempts: attemptNumber,
        lastAttemptAt: now,
        errorMessage: null,
      },
    });
    await tx.externalListing.update({
      where: { id: publicationJob.externalListingId },
      data: { status: "publishing" },
    });
    await tx.publicationEvent.create({
      data: {
        publicationJobId: publicationJob.id,
        externalListingId: publicationJob.externalListingId,
        eventType: "processing",
        message: "Publication processing started.",
        metadata: { attempt: attemptNumber },
      },
    });
    await writeAuditLog(tx, {
      userId: publicationJob.listingDraft.userId,
      action: "publication_processing",
      entityType: "PublicationJob",
      entityId: publicationJob.id,
      metadata: { listingId: publicationJob.listingDraft.id, status: "processing", attempt: attemptNumber },
    });
    return publicationJob;
  });
}

async function markPublicationSucceeded(publicationJobId, attemptNumber, result) {
  await prisma.$transaction(async (tx) => {
    const publicationJob = await loadPublicationJob(tx, publicationJobId);
    if (!publicationJob) throw new Error("Publication job was not found.");

    const now = new Date();
    await tx.publicationJob.update({
      where: { id: publicationJob.id },
      data: {
        status: "success",
        attempts: attemptNumber,
        lastAttemptAt: now,
        completedAt: now,
        errorMessage: null,
      },
    });
    await tx.externalListing.update({
      where: { id: publicationJob.externalListingId },
      data: {
        status: "published",
        externalId: result.externalId,
        externalUrl: result.externalUrl,
      },
    });
    await tx.publicationEvent.create({
      data: {
        publicationJobId: publicationJob.id,
        externalListingId: publicationJob.externalListingId,
        eventType: "published",
        message: "Publication completed.",
        metadata: { attempt: attemptNumber },
      },
    });
    await writeAuditLog(tx, {
      userId: publicationJob.listingDraft.userId,
      action: "publication_succeeded",
      entityType: "PublicationJob",
      entityId: publicationJob.id,
      metadata: { listingId: publicationJob.listingDraft.id, status: "success", attempt: attemptNumber },
    });
  });
}

async function markPublicationFailed(publicationJobId, attemptNumber, maxAttempts) {
  await prisma.$transaction(async (tx) => {
    const publicationJob = await loadPublicationJob(tx, publicationJobId);
    if (!publicationJob) return;

    const retrying = attemptNumber < maxAttempts;
    const status = retrying ? "retrying" : "failed";
    await tx.publicationJob.update({
      where: { id: publicationJob.id },
      data: {
        status,
        attempts: attemptNumber,
        lastAttemptAt: new Date(),
        errorMessage: "Publication attempt failed.",
      },
    });
    await tx.externalListing.update({
      where: { id: publicationJob.externalListingId },
      data: { status: retrying ? "queued" : "failed" },
    });
    await tx.publicationEvent.create({
      data: {
        publicationJobId: publicationJob.id,
        externalListingId: publicationJob.externalListingId,
        eventType: status,
        message: retrying ? "Publication failed and will be retried." : "Publication failed after all retry attempts.",
        metadata: { attempt: attemptNumber, maxAttempts },
      },
    });
    await writeAuditLog(tx, {
      userId: publicationJob.listingDraft.userId,
      action: retrying ? "publication_retrying" : "publication_failed",
      entityType: "PublicationJob",
      entityId: publicationJob.id,
      metadata: { listingId: publicationJob.listingDraft.id, status, attempt: attemptNumber, maxAttempts },
    });
  });
}

const worker = new Worker(
  "publication",
  async (job) => {
    const publicationJobId = typeof job.data?.jobId === "string" ? job.data.jobId : "";
    if (!publicationJobId) throw new Error("Publication queue payload is missing jobId.");

    const attemptNumber = Number(job.attemptsMade || 0) + 1;
    const maxAttempts = Number(job.opts?.attempts || 1);
    await markPublicationProcessing(publicationJobId, attemptNumber);

    try {
      // Official provider calls will replace this controlled mock implementation.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const timestamp = Date.now();
      const result = {
        externalId: `mock-${timestamp}`,
        externalUrl: `https://mock.example.com/${timestamp}`,
      };
      await markPublicationSucceeded(publicationJobId, attemptNumber, result);
      return { status: "published" };
    } catch (error) {
      await markPublicationFailed(publicationJobId, attemptNumber, maxAttempts);
      throw error;
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: config.WORKER_PUBLICATION_CONCURRENCY,
    limiter: {
      max: config.WORKER_PUBLICATION_MAX_JOBS_PER_MINUTE,
      duration: 60_000,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`Publication job ${job.id} completed.`);
});

worker.on("failed", (job) => {
  console.error(`Publication job ${job?.id || "unknown"} failed.`);
});

async function addPublicationJob(publicationJobId, listingId, accountId, draft) {
  const job = await publicationQueue.add(
    "publish",
    { jobId: publicationJobId, listingId, accountId, draft },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  );
  return { jobId: job.id, status: "queued" };
}

console.log(`Worker started: publication concurrency=${config.WORKER_PUBLICATION_CONCURRENCY}, rate=${config.WORKER_PUBLICATION_MAX_JOBS_PER_MINUTE}/minute.`);

module.exports = { addPublicationJob, publicationQueue };
