export enum ListingDraftStatus {
  DRAFT = "draft",
  READY = "ready",
  ARCHIVED = "archived",
}

export enum ExternalListingStatus {
  QUEUED = "queued",
  PUBLISHING = "publishing",
  PUBLISHED = "published",
  FAILED = "failed",
  REQUIRES_ACTION = "requires_action",
  EXPIRED = "expired",
  SOLD = "sold",
  DELETED = "deleted",
  UNSUPPORTED = "unsupported",
}

export enum PublicationJobStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SUCCESS = "success",
  FAILED = "failed",
  RETRYING = "retrying",
  CANCELLED = "cancelled",
}

export enum IntegrationStatus {
  OFFICIAL_API = "official_api",
  PARTNER_API_REQUIRED = "partner_api_required",
  PRO_ACCOUNT_REQUIRED = "pro_account_required",
  MANUAL_EXPORT_ONLY = "manual_export_only",
  UNSUPPORTED = "unsupported",
  RESEARCH_REQUIRED = "research_required",
}