import type { IntegrationStatus } from "./enums";

export interface ProviderCapabilities {
  /** Human-readable provider identifier (e.g., "olx", "vinted_pro"). */
  provider: string;

  /** Whether the provider supports creating listings via API. */
  supportsCreate: boolean;

  /** Whether the provider supports updating listings via API. */
  supportsUpdate: boolean;

  /** Whether the provider supports deleting listings via API. */
  supportsDelete: boolean;

  /** Whether the provider supports syncing external listing status. */
  supportsStatusSync: boolean;

  /** Whether the provider sends webhooks for listing status changes. */
  supportsWebhooks: boolean;

  /** Whether the provider supports delivery/shipping options in listings. */
  supportsDeliveryOptions: boolean;

  /** Whether partner-level access is required to use this provider's API. */
  requiresPartnerAccess: boolean;

  /** Whether a business/pro account is required to use this provider's API. */
  requiresProAccount: boolean;

  /** Maximum number of photos allowed per listing. */
  maxPhotos: number;

  /** Maximum description length in characters. */
  maxDescriptionLength: number;

  /** Whether category IDs must be mapped from internal to provider-specific values. */
  categoryMappingRequired: boolean;

  /** Whether attributes must be mapped from internal to provider-specific values. */
  attributeMappingRequired: boolean;

  /** Current integration status of this provider. */
  integrationStatus: IntegrationStatus;
}

/** Core listing draft data used across the application and connectors. */
export interface ListingDraftData {
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  attributes: Record<string, unknown>;
  photoUrls: string[];
  location: {
    city: string;
    region?: string;
    country: string;
  };
  deliveryOptions: string[];
}