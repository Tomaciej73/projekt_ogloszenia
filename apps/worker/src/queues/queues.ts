// Queue definitions will be initialized here when BullMQ integration is complete.
// Planned queues:
// - publication — Publishing listings to marketplaces
// - status-sync — Syncing external listing statuses
// - webhooks — Processing incoming provider webhooks

export const QUEUE_NAMES = {
  PUBLICATION: "publication",
  STATUS_SYNC: "status-sync",
  WEBHOOKS: "webhooks",
} as const;