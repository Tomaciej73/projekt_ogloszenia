import type {
  ProviderCapabilities,
  ListingDraftData,
  ExternalListingStatus,
} from "@multiportal/shared";

/** Result returned after a successful listing operation. */
export interface ExternalListingResult {
  externalId: string;
  externalUrl?: string;
  status: ExternalListingStatus;
}

/**
 * Provider-agnostic connector interface.
 * Every marketplace provider must implement this contract.
 */
export interface MarketplaceConnector {
  /** Unique provider identifier (e.g., "olx", "vinted_pro"). */
  readonly provider: string;

  /** Provider capabilities declared at instantiation. */
  readonly capabilities: ProviderCapabilities;

  /** Publish a new listing to the marketplace. */
  createListing(
    draft: ListingDraftData,
    accountId: string,
    idempotencyKey: string,
  ): Promise<ExternalListingResult>;

  /** Update an existing listing on the marketplace. */
  updateListing(
    externalId: string,
    draft: ListingDraftData,
    accountId: string,
  ): Promise<ExternalListingResult>;

  /** Delete / unpublish a listing from the marketplace. */
  deleteListing(externalId: string, accountId: string): Promise<void>;

  /** Fetch the current status of an external listing. */
  getListingStatus(
    externalId: string,
    accountId: string,
  ): Promise<ExternalListingStatus>;

  /** Validate a draft against provider-specific constraints. */
  validateDraft(draft: ListingDraftData): string[];

  /** Map an internal category to a provider-specific category ID. */
  mapCategory(internalCategory: string): Promise<string>;

  /** Map internal attributes to provider-specific attributes. */
  mapAttributes(
    internalAttributes: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}