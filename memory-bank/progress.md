# Progress

## Current Status
**Phase 7 - BullMQ Worker Integrated and Frontend Publication** (complete, with auth/config hardening, shared visitor telemetry, and expanded security assessment updates through 2026-07-14)

BullMQ worker processes publication jobs from the Redis queue on port 6739. The API pushes publication jobs to the queue instead of using `setTimeout` mocks. The current runtime stack uses plain Node.js servers for API, web, and worker, with HttpOnly cookie auth backed by JWT signing, SMTP account activation emails, DB-backed login lockout after 5 failed attempts, 6-digit reset codes, stronger password validation across registration and reset flows, and fail-fast runtime config validation shared from `packages/config`.

## Completed

### Infrastructure
- [x] `.clinerules/` - all 5 rules files, including "never revert owner changes"
- [x] pnpm monorepo with 7 workspace packages
- [x] Docker Compose local-development base plus production override that leaves only web reachable on VPS loopback
- [x] API container startup now runs `prisma migrate deploy` before serving requests, so Docker/VPS upgrades apply pending schema changes automatically
- [x] Active API/web/worker runtimes now load per-runtime validated config from `packages/config` via bridge files, instead of reading `process.env` with dangerous secret or `localhost` fallbacks
- [x] App runtime images now use an explicit `.dockerignore`, multi-stage `pnpm deploy` runtime packaging, explicit Prisma config paths, non-root `node` users, and Docker healthchecks
- [x] API image build normalizes the shell entrypoint to LF, preventing CRLF from breaking Alpine migration startup
- [x] Prisma v7 schema with 12 entities and 4 enums
- [x] 5 Prisma migrations applied
- [x] `.env` - all configuration via dotenv, no hardcoded credentials
- [x] `.env.example` - placeholder values only, no real secrets, including SMTP sender placeholders
- [x] Root and workspace `test` / `lint` scripts now execute real smoke checks instead of placeholder `echo ok`
- [x] `how_to_run.md` - non-technical setup guide
- [x] `AGENTS.md` - AI assistant guidance

### Backend API (`apps/api/db-server.js`) v0.4.17
- [x] `POST /auth/register` - creates inactive accounts, generates activation tokens, sends activation email, and returns activation-required messaging
- [x] `GET /auth/activate` - validates activation link, activates account, and renders an HTML confirmation page
- [x] `POST /auth/login` - login with an HttpOnly auth cookie, blocked until account activation, returns DB-backed remaining attempts, and locks the account after 5 failed passwords
- [x] `POST /auth/forgot-password` - validates email/account existence, generates a 6-digit reset code, stores only its DB-backed hash plus expiry metadata, sends it via SMTP, and doubles as the recovery activation path for inactive accounts
- [x] `POST /auth/reset-password` - validates email, DB-backed reset code hash, unique passphrase, and breach status; changes password, clears reset state, unlocks/activates the account, and revokes all prior sessions atomically
- [x] `GET /auth/csrf` - issues and refreshes the same-origin CSRF token used by mutating browser requests
- [x] `GET /auth/me` - current user info
- [x] `GET/DELETE /auth/sessions` and `DELETE /auth/sessions/:id` - list active sessions and end every other or a selected session
- [x] `POST /auth/logout` - revokes the current database session and clears the HttpOnly auth cookie
- [x] Configurable auth rate limiting for `/auth/*`, plus tighter per-route limits for login/register/activate/forgot-password/reset-password
- [x] DB-backed forgot-password resend throttling via `passwordResetRequestedAt`
- [x] Auth rate-limit counters persisted in Redis instead of API process memory
- [x] `GET /health` - health check with DB status
- [x] `GET /site-stats/visitors` - registers a first-seen client IP hash and returns the current total unique visitor count
- [x] `GET/POST /listings` - list/create listing drafts (auth required)
- [x] `GET/PUT/DELETE /listings/:id` - CRUD operations (auth required)
- [x] `POST /publication-jobs` - pushes to BullMQ queue (Redis 6739)
- [x] `GET /publication-jobs/:id` - job status
- [x] `GET /providers` - list marketplace providers
- [x] `GET/POST /marketplace-accounts` - connect provider accounts
- [x] `POST /media/upload-url` - intentionally disabled in the active runtime because direct presigned uploads bypass server-side file validation
- [x] Email validation (regex), 15–256 character passphrase validation, HIBP k-anonymity breach checks, reset code validation, and input sanitization
- [x] JSON request bodies are now capped in-memory, with a 1 MB default limit and a dedicated higher cap for `/media/upload`
- [x] Pretty JSON responses (2-space indent)
- [x] Marketplace-account browser responses use an explicit safe DTO that excludes provider user identifiers, access tokens, refresh tokens, and token-expiry metadata; mock account linking is development-only until official OAuth is implemented
- [x] `/media-files/:bucket/:key` requires an authenticated user and verifies listing ownership before the API streams an object from the private MinIO bucket

### Worker (`apps/worker/worker.js`)
- [x] BullMQ Worker processing `publication` queue
- [x] Connected to Redis on port 6739
- [x] Mock connector simulates external API calls
- [x] 3 retry attempts with exponential backoff (2s, 4s, 8s)

### Frontend (`apps/web/`)
- [x] `public/index.html` - landing page with Login/Register tabs, activation-aware registration/login messaging, DB-synced remaining login-attempt messaging, same-origin API calls, CSRF-aware mutations, passphrase guidance, and an active-session management panel
- [x] `public/create-listing.html` - listing creation form with client-side invalid/corrupted image rejection before upload
- [x] `public/dashboard.html` - publication dashboard: list listings, select provider, publish, and send CSRF-protected mutating requests
- [x] `public/register.html` - standalone registration page with passphrase guidance, activation-required messaging, and CSRF-protected signup
- [x] `public/login.html` - standalone login page with inactive/locked-account recovery hint, DB-synced remaining login-attempt messaging, and CSRF-protected login
- [x] `front-server.js` - static file server plus same-origin API proxy, including media requests that the API authorizes before MinIO access
- [x] All served HTML pages now receive a shared in-flow footer shell with a lower-right `Visitors:` counter, including standalone pages that did not define their own footer before
- [x] User-visible version labels now render from the shared package SemVer (`0.4.1`) instead of duplicated hardcoded footer/log strings
- [x] Main auth flows now surface rate-limit hits as warning toasts with retry timing
- [x] Logout clears all authentication fields and cached account labels from the visible DOM; login forms disable browser autofill hints
- [x] Account panel groups identity information, labels the active device, and keeps color-coded session actions aligned on one desktop row
- [x] Empty listing state uses a prominent onboarding CTA, while manual listing refreshes report success or failure through a toast
- [x] `apps/web/src/` scaffold no longer hardcodes `localhost` API URLs; it now supports optional `NEXT_PUBLIC_API_BASE_URL` with same-origin fallback
- [x] Dashboard after login with listing list and stats
- [x] Session persistence via HttpOnly auth cookie plus non-secret user cache in localStorage (survives refresh/new tab)

### Security
- [x] All credentials only from `.env` via dotenv
- [x] Versioned PBKDF2-HMAC-SHA512 with 220k iterations, 16B random salt, and automatic rehash of legacy 100k hashes after successful login
- [x] HIBP Pwned Passwords k-anonymity breach check for new passphrases; only SHA-1 range prefixes leave the application
- [x] Browser authentication via HttpOnly same-site JWT cookie backed by a revocable `AuthSession` row
- [x] Same-origin CSRF protection for browser mutations via `mp_csrf` cookie plus `X-CSRF-Token`
- [x] Account activation via 1-hour email link with DB-backed activation token hash
- [x] Account lockout after 5 failed login attempts, cleared only by successful password reset
- [x] One-time 6-digit password reset codes with 1-hour expiry and DB-backed hashed persistence
- [x] Auth abuse protection via configurable rate limiting on `/auth/*` and a DB-backed forgot-password resend cooldown
- [x] Per-user Redis rate limits for uploads and publication requests, plus transaction-locked quotas for listings, active publication jobs, and server-recorded media storage
- [x] Worker publication concurrency and throughput limits are configurable and default to 2 concurrent jobs / 30 jobs per minute
- [x] Active API and worker write secret-safe `AuditLog` records for registration/activation/login, password reset, marketplace link/unlink, listing status changes, media upload, and publication lifecycle transitions
- [x] Protected API routes now verify that the authenticated user still exists in PostgreSQL, so stale cookies after a DB reset are cleared with `401` instead of crashing `/auth/me`
- [x] Active session list with single/all-other session revocation; password reset invalidates all sessions through `sessionVersion` and DB revocation
- [x] SMTP startup verification plus delivery-result logging to separate relay acceptance from inbox-side deliverability issues
- [x] SMTP runtime now supports both `587` STARTTLS and `465` SSL/TLS via `SMTP_SECURE`
- [x] Transactional email HTML uses explicit light color-mode metadata, opaque backgrounds, and high-contrast text to remain legible in clients using automatic dark mode
- [x] SMTP debug transport logging disabled to avoid leaking reset codes or mail transport details in container logs
- [x] Mail config warnings for placeholder/misaligned SMTP sender settings
- [x] Runtime SMTP config supports explicit `SMTP_FROM_NAME`, `SMTP_REPLY_TO`, `SMTP_SENDER`, and optional public URL envs for domain-based auth links
- [x] Listing media URLs now stay on the web origin, so thumbnails no longer depend on direct `localhost:9000` or MinIO host exposure
- [x] MinIO media is private and `/media-files` now reaches the API, which checks authentication plus listing ownership before streaming an object; direct MinIO browser access is removed
- [x] Uploads now accept only server-validated JPG/PNG/GIF/WebP payloads, blocking renamed text/script files and malformed image payloads before MinIO storage
- [x] Oversized JSON/base64 uploads are rejected early with `413 Payload Too Large` instead of being buffered into RAM without a limit
- [x] Static HTML now ships with CSP and standard browser security headers from the front server
- [x] Auth CORS now allows only trusted web origins, invalid auth preflights return `403`, and the `mp_csrf` cookie is now `HttpOnly`
- [x] SMTP certificate verification is enabled by default; invalid certificates require the explicit `SMTP_TLS_ALLOW_INVALID_CERTS=true` debugging flag
- [x] Runtime images no longer need `tsx` because API/web/worker load validated config from compiled `@multiportal/config/dist`
- [x] Controlled SemVer dependency pass completed for `0.4.1`, with verified version bumps/overrides and a clean `pnpm audit --json` result
- [x] No hardcoded passwords, tokens, or secrets in source code
- [x] `.env` git-ignored, `.env.example` has placeholders only
- [x] Local ZAP/Burp security assessment completed against the active Docker runtime, with artifacts stored under `security-reports/2026-07-10-zap-burp/`
- [x] Local Trivy, Semgrep, Gitleaks, and Skipfish assessment completed, extending the same report set with runtime image, dependency, secret, and legacy crawler coverage
- [x] Security patch `0.4.2` removes provider credential exposure from marketplace-account API responses and prevents mock provider-account linking in production

## Pending (Next Steps)

### Phase 8 - Provider Integration and Auth Hardening
1. Add automated auth coverage for activation, forgot-password, and restart persistence.
2. Implement OLX connector.
3. Continue official Vinted Pro and Facebook Marketplace API/commercial access research.

### Phase 9 - Testing
6. Add backend unit tests (Jest)
7. Add frontend component tests (Vitest)
8. Add E2E tests (Playwright)

## Known Issues
- NestJS source code exists but is not used at runtime (plain Node.js servers are active instead).
- Current automated checks are still smoke-level only (TypeScript + runtime syntax validation); deeper unit/integration coverage is still pending.
- 2 build scripts remain blocked (`msgpackr-extract`, `sharp`) - needed for Next.js builds, not blocking current development.
- Auth rate limiting now depends on Redis availability; if Redis is down, protected `/auth/*` requests currently fail closed with a temporary `503` until Redis recovers.
- Docker BuildKit cache can still dwarf the final runtime images (currently ~27.9 GB locally), so VPS disk pressure now depends more on pruning stale cache/images than on live app volumes.
- Manual security review is still in progress; JWT is no longer stored in `localStorage`, but any future same-origin XSS could still act through an active browser session even though it can no longer trivially exfiltrate the JWT.
- The upload path now blocks renamed/corrupted non-images through MIME sniffing and image-structure checks, but it does not yet run a dedicated antivirus engine such as ClamAV for full malware scanning.
- Real inbox delivery still depends on a verified `SMTP_FROM` sender and aligned SPF/DKIM/DMARC for the chosen SMTP relay.
- Prisma CLI intentionally allows an empty `DATABASE_URL` in `prisma.config.ts` during client generation, but active runtimes still fail fast when required database/auth/storage config is missing or invalid.

## Current Port Assignments (from `.env`)
| Service | Host Port |
|---------|-----------|
| PostgreSQL | 5243 |
| Redis | 6739 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| API Server | 3001 |
| Web Frontend | 3000 |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-07 | pnpm workspaces for monorepo | Efficient dependency management |
| 2026-07-07 | Plain Node.js HTTP servers for runtime | Immediate development velocity |
| 2026-07-07 | PBKDF2+SHA512 for password hashing | Industry standard |
| 2026-07-07 | PG18 volume path `/var/lib/postgresql` | PG18 changed data directory layout |
| 2026-07-07 | Crypto.randomBytes for all secrets | Non-deterministic |
| 2026-07-07 | Owner's port changes are authoritative | Rule in `.clinerules/01-project.md` |
| 2026-07-07 | Prisma v7 plus pg adapter | Required for Prisma 7+ |
| 2026-07-07 | Zod for config validation | Lightweight, TypeScript-native |
| 2026-07-08 | BullMQ for async publication | Reliable job processing with Redis, retries, persistent queue |
| 2026-07-08 | JWT (`jsonwebtoken`) for authentication | Stateless, industry standard, replaces the earlier in-memory session approach |
| 2026-07-09 | Password reset uses SMTP-delivered 6-digit codes plus strong password rules | Clearer UX and stricter auth validation |
| 2026-07-09 | Login failures are tracked in PostgreSQL and lock accounts after 5 attempts | Keeps frontend counters synchronized with the database and requires password reset for unlock |
| 2026-07-09 | Password reset codes are stored in PostgreSQL as hashes | Survives API restarts, keeps plaintext codes out of the database, and aligns reset persistence with activation tokens |
| 2026-07-09 | Docker Postgres healthcheck now checks the real app database | Stops repeated `database "mp_admin" does not exist` log spam |
| 2026-07-09 | Nodemailer debug logging disabled in runtime | Prevents reset codes and SMTP details from appearing in `docker logs` |
| 2026-07-09 | New accounts stay inactive until email activation or forgot-password activation | Keeps registration explicit and gives an owner-approved recovery path for expired activation links |
| 2026-07-09 | API container runs `prisma migrate deploy` during startup | Prevents registration/login/auth regressions after deploys when PostgreSQL still has the previous schema |
| 2026-07-09 | Listing photos now use same-origin `/media-files/...` URLs with legacy URL normalization | Fixes broken thumbnails when old records or runtime config still pointed at direct MinIO or localhost hosts |
| 2026-07-09 | SMTP startup verify and accepted/rejected logging added | Makes VPS mail troubleshooting clearer and fails faster when the relay is unreachable or slow |
| 2026-07-09 | Mailer now supports implicit TLS on port 465 via `SMTP_SECURE` | Allows switching from STARTTLS relays to SSL/TLS SMTP hosts without code changes |
| 2026-07-09 | Listing and publication-job reads by ID now require owner auth | Prevents cross-user data exposure through guessed UUIDs on `GET /listings/:id` and `GET /publication-jobs/:id` |
| 2026-07-09 | Publication-job creation now verifies listing ownership | Prevents authenticated users from enqueueing publication work for another user's `listingId` |
| 2026-07-09 | Publication-job creation now reuses the provider-specific `ExternalListing` row | Fixes `P2002` on repeated publish attempts for the same draft/provider while still allowing new `PublicationJob` records |
| 2026-07-09 | Docker SMTP env now passes `SMTP_SECURE`, and sender config aligns with `noreply@multiportal.site` | Ensures recreated API containers use the intended Home.pl SSL mailbox config and improves inbox acceptance |
| 2026-07-09 | Listing photo URLs are now restricted to uploaded media paths and rendered via DOM APIs | Blocks stored XSS through malicious `photoUrls` values and suppresses legacy unsafe records in API responses |
| 2026-07-09 | Browser auth moved from JWT-in-`localStorage` to an HttpOnly `mp_auth` cookie | Reduces account-takeover impact of future XSS by keeping the signed session token out of JavaScript-readable storage |
| 2026-07-09 | Mutating browser requests now require a same-origin CSRF token and static HTML is served with CSP/security headers | Adds defense-in-depth around the new cookie-based session model and reduces the blast radius of DOM/script injection bugs |
| 2026-07-09 | Direct presigned uploads were disabled and `/media/upload` now validates real image payloads before storage | Prevents renamed text/script files and malformed uploads from being stored as listing photos |
| 2026-07-10 | Active API/web/worker runtimes now import per-runtime validated config from `packages/config` | Restores fail-fast startup, removes dangerous `localhost`/secret fallbacks, and keeps JS runtime behavior aligned with the shared schema |
| 2026-07-10 | The active API now enforces streaming request-body limits before buffering JSON | Prevents oversized auth/listing payloads and base64 image uploads from exhausting process memory |
| 2026-07-10 | Workspace `dev`, `lint`, and `test` scripts now reflect the real runtime and real checks | Removes placeholder success paths and makes `pnpm test` a meaningful smoke test instead of `echo ok` |
| 2026-07-10 | The main HTML frontend now keeps forgot-password collapsed by default and uses fixed thumbnail grids in edit modals | Prevents unexpected auth-panel expansion, restores spacing between listing cards, and stops single-photo previews from stretching across the modal |
| 2026-07-10 | Every meaningful change must be recorded in `memory-bank`, and version changes must use explicit SemVer notation | Keeps project context durable between sessions and prevents ambiguous version history or undocumented changes |
| 2026-07-10 | `/auth/*` now has configurable rate limiting and forgot-password now has a DB-backed resend cooldown | Reduces brute-force and mailbox-spam risk without hardcoding the thresholds into the runtime |
| 2026-07-10 | Official research confirmed OLX adverts can be created/managed via its verified public API, while Vinted item listing API is gated to allowlisted Pro businesses | Clarifies provider feasibility before connector implementation and highlights unresolved commercial-access questions |
| 2026-07-10 | Auth rate-limit counters now live in Redis and rate-limit responses expose retry timing to the frontend | Makes rate limits survive API restarts / multi-instance sharing and gives the UI enough data to show actionable throttle feedback |
| 2026-07-10 | User-visible runtime version now comes from the root workspace SemVer (`0.4.1`) through a shared helper | Keeps API logs/health and static HTML footers aligned without manual version-string hunting |
| 2026-07-10 | Security assessment artifacts are stored under `security-reports/2026-07-10-zap-burp/`, and the next fix priority is the confirmed `/media-files` CORS/internal-redirect issue | Preserves reproducible evidence for the scan and keeps remediation focused on the highest-signal findings first |
| 2026-07-10 | The assessment methodology now combines ZAP, Burp-family tooling, Skipfish, Trivy, Semgrep, and Gitleaks under a NIST SP 800-115-style report | Keeps web-runtime, code, dependency, container, and secret-detection evidence in one place before remediation starts |
| 2026-07-10 | `/media-files` and auth cross-origin behavior were tightened, SMTP certificate validation was restored, and app containers now run as non-root with healthchecks | Closes the main medium-severity findings from the 2026-07-10 local assessment and stabilizes Docker runtime startup |
| 2026-07-10 | Controlled dependency pass updated the runtime to `0.4.1` and produced a clean `pnpm audit --json` report | Removes known npm advisory findings without blind version bumps and keeps the repo aligned with verified official versions |
| 2026-07-10 | Runtime images now use multi-stage `pnpm deploy` packaging and compiled config loading instead of runtime `tsx` | Cuts final Docker image size substantially while keeping fail-fast config validation and healthchecked non-root containers |
| 2026-07-13 | Marketplace-account API responses use a safe DTO and mock linking is limited to development | Prevents future provider credentials from reaching browser clients and stops production from creating mock marketplace accounts before official OAuth exists |
| 2026-07-14 | Unique visitor counting is keyed by a hashed normalized client IP stored in PostgreSQL and surfaced through a shared HTML overlay | Prevents reloads from inflating the total while avoiding raw IP persistence in the database |
