import type {
  MarketplaceConnector,
  ExternalListingResult,
} from "./interfaces";
import type { ListingDraftData, ProviderCapabilities } from "@multiportal/shared";
import { ExternalListingStatus, IntegrationStatus } from "@multiportal/shared";

const MOCK_CAPABILITIES: ProviderCapabilities = {
  provider: "mock",
  supportsCreate: true,
  supportsUpdate: true,
  supportsDelete: true,
  supportsStatusSync: true,
  supportsWebhooks: false,
  supportsDeliveryOptions: true,
  requiresPartnerAccess: false,
  requiresProAccount: false,
  maxPhotos: 20,
  maxDescriptionLength: 10000,
  categoryMappingRequired: false,
  attributeMappingRequired: false,
  integrationStatus: IntegrationStatus.RESEARCH_REQUIRED,
};

/**
 * Mock connector for development and testing.
 * Simulates all marketplace operations without making real API calls.
 */
export class MockConnector implements MarketplaceConnector {
  readonly provider = "mock";
  readonly capabilities = MOCK_CAPABILITIES;

  async createListing(
    _draft: ListingDraftData,
    _accountId: string,
    idempotencyKey: string,
  ): Promise<ExternalListingResult> {
    return {
      externalId: `mock-${idempotencyKey}-${Date.now()}`,
      externalUrl: `https://mock.example.com/listings/${idempotencyKey}`,
      status: ExternalListingStatus.PUBLISHED,
    };
  }

  async updateListing(
    externalId: string,
    _draft: ListingDraftData,
    _accountId: string,
  ): Promise<ExternalListingResult> {
    return {
      externalId,
      externalUrl: `https://mock.example.com/listings/${externalId}`,
      status: ExternalListingStatus.PUBLISHED,
    };
  }

  async deleteListing(
    _externalId: string,
    _accountId: string,
  ): Promise<void> {
    // no-op for mock
  }

  async getListingStatus(
    _externalId: string,
    _accountId: string,
  ): Promise<ExternalListingStatus> {
    return ExternalListingStatus.PUBLISHED;
  }

  validateDraft(draft: ListingDraftData): string[] {
    const errors: string[] = [];

    if (!draft.title || draft.title.trim().length === 0) {
      errors.push("Title is required.");
    }

    if (draft.title && draft.title.length > 200) {
      errors.push("Title must not exceed 200 characters.");
    }

    if (!draft.description || draft.description.trim().length === 0) {
      errors.push("Description is required.");
    }

    if (draft.description && draft.description.length > this.capabilities.maxDescriptionLength) {
      errors.push(
        `Description must not exceed ${this.capabilities.maxDescriptionLength} characters.`,
      );
    }

    if (draft.price < 0) {
      errors.push("Price must be a non-negative number.");
    }

    if (draft.photoUrls.length > this.capabilities.maxPhotos) {
      errors.push(
        `Maximum ${this.capabilities.maxPhotos} photos allowed, got ${draft.photoUrls.length}.`,
      );
    }

    return errors;
  }

  async mapCategory(internalCategory: string): Promise<string> {
    return `mock-category-${internalCategory}`;
  }

  async mapAttributes(
    internalAttributes: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return internalAttributes;
  }
}

/** Factory function that creates a MockConnector instance. */
export function createMockConnector(): MarketplaceConnector {
  return new MockConnector();
}