import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { createMockConnector } from "@multiportal/connectors";
import { randomUUID } from "node:crypto";

@Injectable()
export class PublicationJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(listingId: string, accountId: string) {
    const idempotencyKey = randomUUID();

    const job = await this.prisma.$transaction(async (tx) => {
      // Create a pending external listing placeholder first
      const externalListing = await tx.externalListing.create({
        data: {
          listingDraftId: listingId,
          marketplaceProviderId: "mock",
          marketplaceAccountId: accountId,
          status: "queued",
        },
      });

      const publicationJob = await tx.publicationJob.create({
        data: {
          idempotencyKey,
          listingDraftId: listingId,
          marketplaceAccountId: accountId,
          externalListingId: externalListing.id,
        },
      });

      return publicationJob;
    });

    // Trigger async publication (will be replaced with BullMQ)
    this.processJob(job.id).catch((error) => {
      console.error(`Publication job ${job.id} failed:`, error);
    });

    return job;
  }

  async processJob(jobId: string) {
    const job = await this.prisma.publicationJob.findUnique({
      where: { id: jobId },
      include: { listingDraft: true },
    });

    if (!job) {
      throw new Error(`Publication job ${jobId} not found`);
    }

    const connector = createMockConnector();

    await this.prisma.publicationJob.update({
      where: { id: jobId },
      data: { status: "processing", lastAttemptAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const draft = job.listingDraft;

      const result = await connector.createListing(
        {
          title: draft.title,
          description: draft.description,
          price: Number(draft.price),
          currency: draft.currency,
          category: draft.category,
          attributes: draft.attributes as Record<string, unknown>,
          photoUrls: draft.photoUrls,
          location: draft.location as { city: string; region?: string; country: string },
          deliveryOptions: draft.deliveryOptions,
        },
        job.marketplaceAccountId,
        job.idempotencyKey,
      );

      await this.prisma.publicationJob.update({
        where: { id: jobId },
        data: { status: "success", completedAt: new Date() },
      });

      await this.prisma.externalListing.update({
        where: { id: job.externalListingId },
        data: {
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          status: "published",
        },
      });
    } catch (error) {
      await this.prisma.publicationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  async getJobStatus(jobId: string) {
    return this.prisma.publicationJob.findUnique({
      where: { id: jobId },
      include: { externalListing: true },
    });
  }
}