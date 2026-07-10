# System Patterns

## Architecture Overview
The system follows a modular monorepo architecture with clear separation between frontend, backend API, background worker, and shared packages.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  apps/web   │────▶│  apps/api   │────▶│ apps/worker │
│  (Next.js)  │     │  (NestJS)   │     │  (NestJS)   │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼────────────────────▼──────┐
                    │         PostgreSQL               │
                    └─────────────────────────────────┘
                           │
                    ┌──────▼──────┐     ┌──────────────┐
                    │    Redis    │     │  MinIO / S3  │
                    │  (BullMQ)   │     │  (Storage)   │
                    └─────────────┘     └──────────────┘
```

## Key Architectural Patterns

### 1. Same-Origin Web-to-API Proxy Pattern
- Browser clients call relative paths such as `/auth/login` instead of hardcoded `localhost` API URLs.
- `apps/web/front-server.js` serves static files and proxies selected API route prefixes to the API runtime target from `API_PROXY_URL`.
- This keeps local Docker, VPS, and Nginx deployments on a single public origin and avoids browser-side `Failed to fetch` errors caused by mixed hosts/ports.

### 2. Same-Origin Media Proxy Pattern
- Browser-rendered listing photos are served through `/media-files/<bucket>/<key>` on the web origin instead of exposing direct MinIO URLs to the client.
- `apps/web/front-server.js` proxies those requests to the internal MinIO target from `MINIO_PROXY_URL`.
- `apps/api/db-server.js` generates media URLs through the web origin and normalizes legacy direct-MinIO or `localhost` photo URLs in listing responses, so existing records keep working after deployment or hostname changes.
- The media proxy strips browser `Origin` and `Referer` before forwarding to MinIO, blocks the bare `/media-files/` path with `404`, forwards only a safe allowlist of response headers, and rewrites only same-origin MinIO `Location` redirects back onto `/media-files/...`.

### 3. Startup Migration Gate
- The API container runs `prisma migrate deploy` before `apps/api/db-server.js` starts accepting traffic.
- This keeps Docker and VPS deployments aligned with the checked-in Prisma migration history.
- If a migration fails, the API container exits instead of serving auth or listing requests against an outdated schema.

### 4. Monorepo with pnpm Workspaces
- `apps/` — Runnable applications (web, api, worker)
- `packages/` — Shared libraries (shared, connectors, config)
- Each package has its own `package.json` and `tsconfig.json`
- Shared code lives in packages, never duplicated between apps

### 5. Provider-Agnostic Connector Pattern
All marketplace integrations implement the same `MarketplaceConnector` interface:

```typescript
interface MarketplaceConnector {
  readonly provider: string;
  readonly capabilities: ProviderCapabilities;

  // Lifecycle
  createListing(draft: ListingDraftData, account: MarketplaceAccount, idempotencyKey: string): Promise<ExternalListingResult>;
  updateListing(externalId: string, draft: ListingDraftData, account: MarketplaceAccount): Promise<ExternalListingResult>;
  deleteListing(externalId: string, account: MarketplaceAccount): Promise<void>;
  getListingStatus(externalId: string, account: MarketplaceAccount): Promise<ExternalListingStatus>;
  validateDraft(draft: ListingDraftData): ValidationResult;
  mapCategory(internalCategory: string): Promise<string>; // maps to provider category ID
  mapAttributes(internalAttributes: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface ProviderCapabilities {
  supportsCreate: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
  supportsStatusSync: boolean;
  supportsWebhooks: boolean;
  supportsDeliveryOptions: boolean;
  requiresPartnerAccess: boolean;
  requiresProAccount: boolean;
  maxPhotos: number;
  maxDescriptionLength: number;
  categoryMappingRequired: boolean;
  attributeMappingRequired: boolean;
  integrationStatus: IntegrationStatus;
}
```

**Rules:**
- Application code never imports provider-specific modules directly
- Provider-specific logic stays entirely inside connector packages
- Connectors are registered dynamically (not hardcoded imports)
- Each connector declares its capabilities explicitly

### 6. Publication Job Flow
```
User clicks "Publish" ──▶ API creates PublicationJob (pending)
                                │
                        ┌───────▼───────┐
                        │  BullMQ Queue │
                        └───────┬───────┘
                                │
                        ┌───────▼───────┐
                        │    Worker     │
                        │  picks up job │
                        └───────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │  Job Processor        │
                    │  1. Validate draft    │
                    │  2. Load connector    │
                    │  3. Map data          │
                    │  4. Call provider API │
                    │  5. Store result      │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Update ExternalListing│
                    │  & PublicationJob     │
                    │  status               │
                    └───────────────────────┘
```

### 7. Idempotency Pattern
- Every publication request generates an idempotency key on the client side
- The key is stored in `PublicationJob.idempotencyKey`
- Before creating a job, the system checks for existing jobs with the same key
- If found and still valid, returns the existing job instead of creating a duplicate
- Prevents duplicate listings from retries or network issues

### 8. Token Encryption at Rest
- Provider OAuth tokens and API keys are encrypted before storage
- Application-level encryption (not just DB-level)
- Encryption key comes from environment variable (`TOKEN_ENCRYPTION_KEY`)
- Encryption/decryption happens in a dedicated service, not in controllers
- Never log token values (use redacted versions for debugging)
- Token fields use `text` type in PostgreSQL (not `varchar(255)`)

### 9. Configuration Validation (Fail-Fast)
- All configuration loaded from environment variables
- Validated at application startup using Zod schemas
- Active JS runtimes (`apps/api/db-server.js`, `apps/web/front-server.js`, `apps/worker/worker.js`) load per-runtime schemas from `packages/config` through small `runtime-config.js` bridge files.
- If required variables are missing or invalid, the active runtime refuses to start instead of silently using secret placeholders or `localhost` endpoints.
- Validation happens in `packages/config` and is shared by all apps, but Prisma client generation intentionally uses an empty `DATABASE_URL` fallback in `prisma.config.ts` so Docker builds can generate the client without a live database connection or build-time secret injection.
- No default values for secrets or environment-specific settings in active runtime processes.

### 10. Module Separation (Backend)
```
apps/api/src/
  modules/
    auth/           — Authentication & authorization
    users/          — User management
    workspaces/     — Multi-tenant workspace management
    listings/       — Listing draft CRUD
    media/          — File upload & S3 management
    marketplace-accounts/  — Connected provider accounts
    marketplace-connectors/ — Connector registry & routing
    publication-jobs/      — Job creation & status
    webhooks/       — Incoming provider webhooks
    audit-log/      — Audit trail
    config/         — App configuration (uses packages/config)
```

### 11. API Design Patterns
- REST API with JSON
- Controllers are thin; business logic in services
- Input validation via DTOs + class-validator or Zod
- All publication endpoints return job IDs, not synchronous results
- Status polling or webhooks for async results
- Pagination for list endpoints
- Rate limiting on auth and publication endpoints

### 12. Error Handling Pattern
- Domain errors: typed error classes for business rule violations
- Provider errors: wrapped provider-specific errors with context
- HTTP errors: mapped from domain/provider errors in exception filters
- Workers: failed jobs go to retry with exponential backoff, then dead letter queue
- All errors logged to audit log when affecting external listings

### 13. Password Reset Code Flow
- `POST /auth/forgot-password` validates email format and checks that the account exists before trying to send mail.
- The API generates a 6-digit one-time code, stores only its SHA-256 hash in PostgreSQL on the `User` row, and records a 1-hour expiry plus request timestamp.
- SMTP delivery must succeed; if the mail server rejects the recipient or sending fails, the pending reset state is cleared from the database and the request returns an error.
- `POST /auth/reset-password` validates email, reset code, expiry, and strong password rules before updating the stored password hash.
- Invalid code submissions increment `passwordResetAttempts`; after 5 failed attempts the reset state is cleared and the user must request a new code.
- Reset codes are single-use and removed after a successful password reset or when an expired code or attempt limit is detected.
- Successful password reset also clears any account lock state (`failedLoginAttempts`, `lockedAt`) so reset is the only recovery path for locked accounts.

### 14. Login Lockout Flow
- `POST /auth/login` keeps `failedLoginAttempts` and `lockedAt` on the `User` row in PostgreSQL.
- Each invalid password increments the DB counter and the API returns the remaining attempts so the frontend can show a synchronized countdown.
- On the 5th failed password the API stores `lockedAt`, caps `failedLoginAttempts` at 5, and returns `423 Locked` with guidance to use `Forgot password`.
- Successful login clears the failed-attempt counter as long as the account was not already locked.

### 15. Account Activation Flow
- `POST /auth/register` creates the user immediately but keeps the account inactive until email confirmation.
- Registration generates a random activation token, stores only its SHA-256 hash plus a 1-hour expiry in PostgreSQL, and sends the raw link token by email.
- `GET /auth/activate?email=...&token=...` activates the account when the token hash matches and the expiry has not passed.
- If the activation link expires, the account remains in the database as inactive and later registration attempts on the same email are rejected with guidance to use `Forgot password`.
- `POST /auth/reset-password` also activates inactive accounts after the user proves mailbox ownership with the emailed reset code and sets a new password.

### 16. Auth Rate Limit and Reset Resend Throttle
- Every `/auth/*` request now passes through a generic authentication rate limiter keyed by client IP in the active API runtime.
- Sensitive routes (`/auth/login`, `/auth/register`, `/auth/activate`, `/auth/forgot-password`, `/auth/reset-password`) also have tighter route-specific limits.
- Login, registration, forgot-password, and reset-password requests add a second limiter keyed by normalized email address when an email is present.
- The active API stores auth limiter counters in Redis, so request counters survive API restarts and can be shared by multiple API instances as long as they use the same Redis backend.
- `POST /auth/forgot-password` also enforces a database-backed resend cooldown via `passwordResetRequestedAt`, so recently sent reset codes cannot be re-requested immediately even after an API restart.
- Rate-limit `429` responses include `Retry-After`, `X-RateLimit-*`, and `retryAfterSeconds`, allowing the active frontend to show user-facing throttle warnings with real wait times.

### 17. Hardened Runtime Image Pattern
- Runtime Docker images install from the checked-in pnpm lockfile using workspace package manifests only, keeping dependency resolution deterministic without copying secrets such as `.env` into the build context.
- `.dockerignore` excludes `.env`, temporary local artifacts, `node_modules`, git metadata, security artifacts, AI workflow files, and package build output from Docker build context transfer.
- Multi-stage Docker builds compile shared config packages once, then use `pnpm deploy --prod --legacy --ignore-scripts` to copy only the runtime app payload plus pruned production dependencies into the final image.
- Active JS runtimes now load validated config from compiled `@multiportal/config/dist/config.js`, so the final images do not need the runtime `tsx` dependency or the full monorepo source layout.
- The API image runs Prisma client generation during the image build and `prisma migrate deploy` during container startup using explicit Prisma config paths, avoiding working-directory ambiguity in both the builder and the pruned runtime image.
- App runtime images switch to the non-root `node` user and declare Docker healthchecks through `apps/api/healthcheck.js`, `apps/web/healthcheck.js`, and `apps/worker/healthcheck.js`.
- This pattern cut the final image sizes on 2026-07-10 from roughly `2.6 GB` each down to about `751 MB` (API), `731 MB` (web), and `276 MB` (worker); after that change the main remaining disk-pressure source is stale BuildKit cache rather than live runtime volumes.
