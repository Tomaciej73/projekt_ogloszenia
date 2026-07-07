import { createMockConnector } from "@multiportal/connectors";

interface PublicationJob {
  id: string;
  idempotencyKey: string;
  listingDraftId: string;
  marketplaceAccountId: string;
  externalListingId: string;
  draft: {
    title: string;
    description: string;
    price: number;
    currency: string;
    category: string;
    attributes: Record<string, unknown>;
    photoUrls: string[];
    location: unknown;
    deliveryOptions: string[];
  };
}

/**
 * Publication job processor using the mock connector.
 * Will be replaced with BullMQ worker when Redis integration is complete.
 */
export async function processPublicationJob(job: PublicationJob): Promise<{
  externalId: string;
  externalUrl?: string;
}> {
  const connector = createMockConnector();

  const result = await connector.createListing(
    {
      title: job.draft.title,
      description: job.draft.description,
      price: job.draft.price,
      currency: job.draft.currency,
      category: job.draft.category,
      attributes: job.draft.attributes,
      photoUrls: job.draft.photoUrls,
      location: job.draft.location as { city: string; region?: string; country: string },
      deliveryOptions: job.draft.deliveryOptions,
    },
    job.marketplaceAccountId,
    job.idempotencyKey,
  );

  return result;
}