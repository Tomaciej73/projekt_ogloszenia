# Technical Context

## Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend runtime | Plain Node.js static server plus HTML/CSS/JS | Current web application shell |
| Frontend scaffolding | Next.js / TypeScript source kept in repo | Future migration path |
| Backend runtime | Plain Node.js HTTP server | Current REST API runtime |
| Backend scaffolding | NestJS / TypeScript source kept in repo | Future migration path |
| Worker runtime | Plain Node.js BullMQ worker | Background job processing |
| Database | PostgreSQL | Primary data store |
| ORM | Prisma plus `@prisma/adapter-pg` | Database schema and queries |
| Queue/Cache | Redis plus BullMQ | Publication job queue |
| File Storage | MinIO (local) / S3 (prod) | Listing media storage |
| Package Manager | pnpm | Monorepo workspace management |
| Validation | Zod plus custom runtime validation helpers | Config and input validation |
| Testing | Jest, Vitest, Testing Library, Playwright | Planned automated coverage |
| Local Dev | Docker Compose | PostgreSQL, Redis, MinIO |

## Runtime Entry Points

- `apps/web/front-server.js` serves static pages from `apps/web/public/`
- `apps/web/runtime-config.js` loads the validated web runtime config from compiled `@multiportal/config/dist/config.js`
- `apps/web/src/` is still a future Next.js migration path, but its API calls now use optional `NEXT_PUBLIC_API_BASE_URL` instead of hardcoded `localhost`
- `apps/api/docker-entrypoint.sh` runs `prisma migrate deploy` and then starts `db-server.js` from the pruned runtime app root
- `apps/api/db-server.js` handles the active REST API runtime
- `apps/api/healthcheck.js`, `apps/web/healthcheck.js`, and `apps/worker/healthcheck.js` provide container-native runtime health probes
- `apps/api/runtime-config.js` loads the validated API runtime config from compiled `@multiportal/config/dist/config.js`
- `apps/worker/worker.js` processes BullMQ jobs
- `apps/worker/runtime-config.js` loads the validated worker runtime config from compiled `@multiportal/config/dist/config.js`
- `packages/config/app-version.js` reads the shared `@multiportal/config` package SemVer and serves as the runtime version source of truth for API logs/health and injected HTML footer labels

Next.js and NestJS source scaffolding remains in the repository, but those entry points are not the active runtime today.

## Version Policy

All dependency versions must follow the project policy defined in `.clinerules/03-workflow.md` and `README.md`:

1. Verify the latest stable or latest LTS version from official sources before pinning.
2. Prefer latest LTS for runtimes such as Node.js.
3. Prefer latest stable versions for frameworks and libraries unless compatibility issues are documented.
4. Use explicit SemVer when pinning or documenting versions (`x.y.z`, or a deliberate SemVer range when there is a specific reason).
5. Do not guess versions.
6. Do not use `latest` Docker tags for production-oriented configuration.
7. Document checked dates and source types here.

## Application Version

- `0.4.12` (2026-07-14) - PATCH UI release. The shared visitor counter now uses a fixed bottom dock that aligns to the footer padding and keeps the `Visitors:` label pinned to the right edge of the viewport on different screen sizes.
- `0.4.11` (2026-07-14) - PATCH UI release. The shared visitor counter now sits in the lower-right viewport corner, shows the compact `Visitors:` label, and copies the rendered footer typography/colors for consistent presentation across static HTML pages.
- `0.4.10` (2026-07-14) - PATCH analytics release. Static HTML pages now show a shared bottom-left unique visitor counter backed by PostgreSQL, with unique visitors keyed by HMAC-SHA256 hashes of normalized client IPs instead of raw addresses.
- `0.4.4` (2026-07-13) - PATCH security release. Passwords use PBKDF2-HMAC-SHA512 with 220,000 iterations plus rehash-on-login, known breached passphrases are blocked through HIBP k-anonymity, and JWTs are backed by revocable database sessions.

## Verified Versions

Checked 2026-07-10 via official Node.js / npm registry / Docker Hub sources.

### Runtime

| Runtime | Version | Policy | Source |
|--------|---------|--------|--------|
| Node.js | 24.18.0 | Latest LTS baseline | nodejs.org |
| Node.js Current | 26.5.0 | Current release, not production baseline | nodejs.org |

### Docker Images

| Image | Version | Source | Notes |
|-------|---------|--------|-------|
| PostgreSQL | 18.4-alpine3.23 | Docker Hub | Latest stable major |
| Redis | 8.8.0-alpine3.23 | Docker Hub | Latest stable major |
| MinIO | RELEASE.2025-07-23T15-54-02Z | Docker Hub | Pinned local-dev tag |

### npm Packages

| Package | Version | Source |
|---------|---------|--------|
| pnpm | 11.10.0 | npm registry |
| Next.js | 16.2.10 | npm registry |
| NestJS (`@nestjs/core`) | 11.1.27 | npm registry |
| Prisma | 7.8.0 | npm registry |
| React | 19.2.7 | npm registry |
| React DOM | 19.2.7 | npm registry |
| TypeScript | 6.0.3 | npm registry |
| Zod | 4.4.3 | npm registry |
| Tailwind CSS | 4.3.2 | npm registry |
| BullMQ | 5.80.1 | npm registry |
| Express | 5.2.1 | npm registry |
| dotenv | 17.4.2 | npm registry |
| jsonwebtoken | 9.0.3 | npm registry |
| minio | 8.0.7 | npm registry |
| multer | 2.2.0 | npm registry |
| postcss | 8.5.16 | npm registry |
| `@hono/node-server` (override) | 1.19.14 | npm registry |
| Vitest | 4.1.10 | npm registry |
| Jest | 30.4.2 | npm registry |
| Playwright | 1.61.1 | npm registry |

## Development Environment

### Prerequisites

- Node.js 24.18.0
- pnpm 11.10.0
- Docker and Docker Compose
- Git

### Docker Compose Services

- PostgreSQL 18 on host port `5243`
- Redis 8 on host port `6739`
- MinIO API on host port `9000`
- MinIO Console on host port `9001`
- API runtime on host port `3001`
- Web runtime on host port `3000`
- Browser clients now call the web origin only; `apps/web/front-server.js` proxies selected API routes to the API runtime target.
- Browser-rendered listing photos stay on the web origin; `apps/web/front-server.js` proxies `/media-files/...` to the API, which authenticates the request and verifies listing ownership before it reads from private MinIO storage.
- The API container depends on MinIO health and replaces any legacy public bucket policy during startup before accepting requests.
- `docker-compose.prod.yml` clears host ports for PostgreSQL, Redis, MinIO, its console, and API. It binds only web to loopback for a TLS reverse proxy.
- API/web/worker app containers now run as the non-root `node` user and expose image-defined Docker healthchecks.
- As of 2026-07-10 the final runtime image sizes are approximately `751 MB` (API), `731 MB` (web), and `276 MB` (worker); Docker BuildKit cache is still much larger and requires operational pruning when disk pressure matters.
- Security scanners are not part of `docker-compose.yml` and must remain isolated from the runtime stack; run them as disposable separate containers or local tools, then clean up their images/cache after the assessment.

## Environment Variables

Key `.env` groups:

- **Database:** `DATABASE_URL`
- **Redis:** `REDIS_URL`
- **Storage:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **Web proxy:** `API_PROXY_URL`
- **Auth:** `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`
- **Password breach checks:** `PASSWORD_BREACH_CHECK_ENABLED`, `PASSWORD_BREACH_CHECK_FAIL_CLOSED`, `PASSWORD_BREACH_CHECK_URL`, `PASSWORD_BREACH_CHECK_TIMEOUT_MS`
- **Resource limits:** `USER_STORAGE_QUOTA_BYTES`, `USER_MAX_LISTINGS`, `USER_MAX_ACTIVE_PUBLICATION_JOBS`, `UPLOAD_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX_REQUESTS`, `PUBLICATION_RATE_LIMIT_WINDOW_MS`, `PUBLICATION_RATE_LIMIT_MAX_REQUESTS`
- **Worker publication limits:** `WORKER_PUBLICATION_CONCURRENCY`, `WORKER_PUBLICATION_MAX_JOBS_PER_MINUTE`
- **Auth rate limiting:** `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`, `AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS`, `AUTH_REGISTER_RATE_LIMIT_WINDOW_MS`, `AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS`, `AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS`, `AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS`, `AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS`, `AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS`, `AUTH_ACTIVATE_RATE_LIMIT_WINDOW_MS`, `AUTH_ACTIVATE_RATE_LIMIT_MAX_REQUESTS`, `AUTH_PASSWORD_RESET_RESEND_COOLDOWN_MS`
- **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- **SMTP transport mode:** optional `SMTP_SECURE`, optional `SMTP_REQUIRE_TLS`, and optional temporary-debug-only `SMTP_TLS_ALLOW_INVALID_CERTS`
- **Encryption:** `TOKEN_ENCRYPTION_KEY`
- **App:** `API_PORT`, `WEB_PORT`, `NODE_ENV`, `LOG_LEVEL`, `API_PROXY_URL`, optional `API_PUBLIC_URL`, optional `WEB_PUBLIC_URL`
- **Next.js scaffold only (optional):** `NEXT_PUBLIC_API_BASE_URL`
- **Provider OAuth (future):** `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, etc.
- `.env` values are loaded through `dotenv`, so concrete URLs must be written directly; shell-style interpolation inside values such as `http://localhost:${MINIO_API_PORT}` is not expanded by the active runtime.

## Package Structure

```text
apps/web/
  front-server.js
  public/
    index.html
    create-listing.html
    dashboard.html
  src/                  # future Next.js source scaffolding

apps/api/
  db-server.js
  prisma/
    schema.prisma
  src/                  # future NestJS source scaffolding

apps/worker/
  worker.js
  src/                  # future NestJS source scaffolding

packages/shared/
packages/connectors/
packages/config/
```

## Database

- Prisma schema: `apps/api/prisma/schema.prisma`
- Prisma client is created directly in `apps/api/db-server.js` using `@prisma/adapter-pg`
- IDs use UUIDs
- Timestamps use `@default(now())` and `@updatedAt`
- Token fields use `TEXT`-compatible storage, not `varchar(255)`
- `User` now includes activation, login lockout, password reset, and session invalidation state fields: `isActive`, `activatedAt`, `failedLoginAttempts`, `lockedAt`, `activationTokenHash`, `activationTokenExpiresAt`, `passwordResetCodeHash`, `passwordResetCodeExpiresAt`, `passwordResetRequestedAt`, `passwordResetAttempts`, and `sessionVersion`
- `AuthSession` stores opaque per-login IDs, timestamps, expiry, revocation, and a bounded user-agent label; it does not store passwords or raw session tokens.
- `UniqueSiteVisitor` stores only an HMAC-SHA256 hash of the normalized client IP plus first/last-seen timestamps for the shared unique-visitor counter; raw IP addresses are not persisted.

## Queue System

- Active queue: `publication`
- Backed by Redis on port `6739`
- Worker retries use exponential backoff
- Queue processing is handled by `apps/worker/worker.js`

## Auth and Security Notes

- Browser authentication uses an HttpOnly same-site `mp_auth` cookie that carries the signed JWT; browser mutations also require a same-origin CSRF token.
- The `mp_csrf` cookie is also `HttpOnly`; browser JavaScript uses the `/auth/csrf` JSON response body as the request header source instead of reading the cookie directly.
- Registration creates inactive accounts until email activation is completed.
- Accounts lock after 5 failed login attempts and stay locked until the password reset flow completes successfully.
- Account activation links use DB-backed token hashes with 1-hour expiry.
- Passwords use versioned PBKDF2-HMAC-SHA512 with 220,000 iterations and a 16-byte random salt. Legacy 100,000-iteration hashes are accepted only long enough to be upgraded after a successful login.
- New passwords must be unique passphrases of 15–256 characters; composition rules were removed to allow memorable passphrases without reducing the minimum length.
- New passwords are checked with the HIBP Pwned Passwords k-anonymity range API. Only the first five characters of a locally calculated SHA-1 hash are sent; a failed check is rejected by default through `PASSWORD_BREACH_CHECK_FAIL_CLOSED=true`.
- Password reset uses SMTP-delivered 6-digit codes with 1-hour expiry.
- Reset codes are stored in PostgreSQL as SHA-256 hashes scoped to the user ID, with expiry, request timestamp, and invalid-attempt counter.
- The active API now enforces configurable auth rate limits for `/auth/*` plus tighter per-route limits for login/register/activate/forgot-password/reset-password.
- Password reset code re-sends are additionally throttled through `passwordResetRequestedAt`, so a fresh code cannot be requested again until the configured cooldown expires.
- Every login creates an `AuthSession` and JWTs include both its opaque session ID and `User.sessionVersion`. Protected requests verify the active database session, and users can list/end individual or all other sessions through `/auth/sessions`.
- Password reset increments `sessionVersion` and revokes all `AuthSession` rows in one transaction, invalidating every old JWT before the next request.
- Login responses can return DB-backed `remainingLoginAttempts` and `accountLocked` flags so the frontend stays synchronized with the actual lock state.
- Inactive accounts can also be activated through the forgot-password reset flow after mailbox verification.
- Runtime startup now fails fast if required auth/storage/SMTP config is missing or invalid; the active API/web/worker processes no longer fall back to placeholder secrets or implicit `localhost` endpoints.
- Mailer warns at startup when the configured sender domain looks misaligned with the SMTP relay setup.
- Mailer now also verifies the SMTP transport at startup and logs the relay response plus `accepted` / `rejected` recipients after each send.
- Mail transport automatically uses implicit SSL/TLS when `SMTP_SECURE=true` or `SMTP_PORT=465`; otherwise it defaults to STARTTLS with `SMTP_REQUIRE_TLS=true`.
- API runtime can honor optional `API_PUBLIC_URL` and `WEB_PUBLIC_URL` environment variables to avoid generating auth links with `localhost` when the app is exposed behind a public domain.
- Auth CORS now responds only for trusted web origins, and invalid auth preflight origins receive `403 Origin not allowed`.
- Listing photo responses normalize legacy direct-MinIO URLs and now prefer web-origin `/media-files/...` links, so older rows that still store `http://localhost:9000/...` continue working in the UI.
- MinIO objects are private. API startup replaces legacy public bucket policy before listening. `/media-files/...` is handled by the API, which authenticates the request, verifies listing ownership, rejects traversal/malformed encodings, and streams only accepted image MIME types inline; unknown legacy objects are `application/octet-stream` attachments with `Cache-Control: private, no-store` and `Cross-Origin-Resource-Policy: same-origin`.
- Production must use `docker-compose.prod.yml` together with the base Compose file and expose only web through a TLS-terminating reverse proxy. PostgreSQL, Redis, MinIO, its console, and API have no VPS host ports in that profile.
- SMTP relay acceptance alone is not enough for Gmail/Onet inbox delivery; verified sender mailbox plus aligned SPF/DKIM/DMARC remain required.
- Verbose nodemailer transport logging is disabled in runtime to avoid leaking reset codes or SMTP session details into container logs.
- SMTP certificate verification is enabled by default again; invalid certificates are allowed only through the explicit `SMTP_TLS_ALLOW_INVALID_CERTS=true` debug flag.
- Transactional email HTML deliberately declares `color-scheme: light`, supplies legacy `bgcolor` attributes, and uses opaque high-contrast colors instead of gradients or translucent text so clients with automatic dark mode do not create unreadable mixed-color rendering.
- JSON request parsing in `apps/api/db-server.js` now enforces byte caps while reading the stream: 1 MB for normal JSON endpoints and a larger route-specific cap for `/media/upload` that matches the 10 MB decoded image limit plus base64 overhead.
- Auth rate limit counters now live in Redis, while the forgot-password resend cooldown is persisted in PostgreSQL through the existing `User.passwordResetRequestedAt` field.
- If Redis is unavailable, auth endpoints currently fail closed with a temporary `503` because rate limiting is treated as required security infrastructure.
- Upload and publication rate limits likewise fail closed if Redis is unavailable. Listing, active-job, and storage quotas are checked under a transaction-scoped PostgreSQL advisory lock keyed by user ID; uploads must belong to a listing and their `ListingMedia` record is created in the same transaction as the MinIO object write.
- The active runtime writes `AuditLog` rows transactionally with successful security-relevant actions. The shared metadata sanitizer excludes passwords, reset codes, tokens, secrets, cookies, credentials, and API/private keys; worker status changes also create `PublicationEvent` rows.
- Runtime images are produced through multi-stage `pnpm deploy` packaging, remove the runtime `tsx` dependency, and the current dependency set passes `pnpm audit --json` with zero known npm advisories as of 2026-07-10.
- The API Docker builder normalizes `docker-entrypoint.sh` to LF before invoking Alpine `/bin/sh`, preventing Windows CRLF checkouts from blocking `prisma migrate deploy`.
- MFA/passkeys are not implemented yet. They require a separate WebAuthn credential model, registration/verification ceremony, recovery procedure, and product decision on mandatory versus optional enrolment.
- Never log passwords, reset codes, tokens, cookies, authorization headers, API keys, or encryption keys.

## Testing Strategy

- Backend: Jest unit and integration tests
- Frontend: Vitest plus Testing Library
- E2E: Playwright
- Current `pnpm test` coverage is now smoke-level only: TypeScript type-checking for scaffold packages/apps plus `node --check` validation for the active JS runtimes. Business-level unit/integration/E2E coverage is still pending.

## Constraints

- No hardcoded configuration values
- No absolute file paths
- No secrets in source code or version control
- All external URLs and credentials must come from environment variables
- Provider-specific logic must stay isolated in connector packages
- Fail-fast validation should happen at startup for required configuration
