import type { ListingDraftStatus } from "@multiportal/shared";

export class UpdateListingDto {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
  attributes?: Record<string, unknown>;
  location?: {
    city: string;
    region?: string;
    country: string;
  };
  photoUrls?: string[];
  deliveryOptions?: string[];
  status?: ListingDraftStatus;
}