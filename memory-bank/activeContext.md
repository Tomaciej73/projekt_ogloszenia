# Active Context

## Current Phase
**Phase 8 - Provider Research and Auth Hardening** (in progress)

A fully working application is running: user registration/login with HttpOnly cookie auth backed by JWT signing plus PBKDF2+SHA512 password hashing, account activation via expiring email links, DB-backed login lockout after repeated failures, password reset flow with SMTP-delivered 6-digit codes, listing draft CRUD stored in PostgreSQL via Prisma, publication job creation with BullMQ, and a web frontend dashboard. The web runtime now proxies API routes so browser clients can use the same origin instead of hardcoded `localhost` API URLs. Docker Compose includes PostgreSQL 18, Redis 8, MinIO, and optional API+Web containers (`profile: full`).

## Active Decisions

- **Monorepo structure confirmed:** `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/connectors`, `packages/config`
- **Tech stack confirmed:** pnpm workspaces, Node.js 24 LTS, PostgreSQL 18, Prisma v7 (with pg adapter), Redis 8, BullMQ, MinIO/S3
- **Runtime servers:** Plain Node.js HTTP servers (`apps/api/db-server.js`, `apps/web/front-server.js`) instead of NestJS/Next.js builds - chosen for immediate development velocity. NestJS source code exists as reference for future migration.
- **Runtime config source of truth:** Active JS runtimes now import per-runtime validated config from `packages/config` through small `runtime-config.js` bridges, so API/web/worker no longer bypass schema validation with secret or `localhost` fallbacks.
- **Provider roadmap:** OLX (1st) -> Vinted Pro (2nd) -> Facebook Marketplace (3rd). All `research_required`.
- **Version policy:** Latest LTS for runtimes, latest stable for frameworks, no `latest` Docker tags, verify from official sources.
- **Pinned package manager:** pnpm@11.10.0
- **Workspace protocol:** `workspace:*` for inter-package dependencies
- **Security:** All credentials from `.env` via dotenv. No hardcoded secrets in source code. PBKDF2+SHA512+16B salt for passwords. Browser auth now uses an HttpOnly same-site cookie carrying the signed JWT instead of storing the JWT in `localStorage`, and mutating requests require a same-origin CSRF token (`/auth/csrf` + `X-CSRF-Token`). New accounts are inactive until activated by email link or by the forgot-password activation flow. Accounts lock after 5 failed login attempts and are unlocked only by completing the password reset flow. Password reset requires a registered email, a one-time 6-digit code whose SHA-256 hash is stored in PostgreSQL, and a strong password (uppercase, lowercase, number, special character). Image uploads now accept only validated JPG/PNG/GIF/WebP payloads after server-side MIME sniffing and structural checks; direct presigned uploads are disabled in the active runtime.
- **Mail deliverability constraint:** The SMTP relay currently accepts messages, and runtime config now points to `noreply@manager.multiportal.site`, but real inbox delivery to providers like Gmail/Onet still depends on that mailbox actually existing on the relay plus aligned SPF/DKIM/DMARC.
- **Owner's changes are authoritative:** Port numbers, configuration values, file names chosen by the project owner must not be reverted or "corrected" by AI. See `.clinerules/01-project.md`.
- **Current port assignments (from `.env`):** PostgreSQL 5243, Redis 6739, MinIO API 9000, MinIO Console 9001, API 3001, Web 3000.

## Immediate Next Steps

1. Add rate limiting and resend throttling for `/auth/*` and password reset endpoints.
2. Add E2E coverage for activation, forgot-password, and restart persistence scenarios.
3. Implement provider connector interface with real OLX research.
4. Add E2E tests for the main listing and publication flows.

## Known Unknowns

- OLX official API availability and documentation
- Vinted Pro API requirements
- Facebook Marketplace API access
- Production deployment strategy (container orchestration, cloud provider)

## Recent Changes

- 2026-07-10: Removed dangerous runtime config fallbacks from the active API/web/worker processes by adding per-runtime Zod loaders in `packages/config`, wiring the JS runtimes through `runtime-config.js` bridge files, requiring explicit proxy envs for the web server, and passing the missing auth/config secrets through Docker Compose.
- 2026-07-09: Added CSRF hardening for mutating requests via `GET /auth/csrf`, `mp_csrf` cookie issuance, `X-CSRF-Token` validation in the API, and same-origin frontend fetch helpers; added CSP plus standard security headers in the web server, removing inline event handlers from active HTML so the main pages can run under `script-src-attr 'none'`.
- 2026-07-09: Hardened media uploads by disabling direct presigned uploads, validating base64 payloads as real JPG/PNG/GIF/WebP images on the API before writing to MinIO, canonicalizing stored filenames/extensions from detected content, and adding frontend rejection/toast messaging for invalid or corrupted image files.
- 2026-07-09: Moved browser auth off JWT-in-`localStorage` and onto an HttpOnly `mp_auth` cookie, added `POST /auth/logout`, updated the frontend to use same-origin cookie sessions, and verified login/logout plus authenticated listing reads through `curl`.
- 2026-07-09: Closed the stored-XSS path in listing photos by validating `photoUrls` against uploaded media paths in the API, filtering legacy invalid values out of listing responses, and rendering dashboard/detail/photo thumbnails plus fullscreen previews through DOM APIs instead of URL interpolation / `document.write`.
- 2026-07-09: Hardened `POST /publication-jobs` so the submitted `listingId` must belong to the authenticated user before creating `ExternalListing` / `PublicationJob` rows or enqueueing publish work.
- 2026-07-09: Fixed duplicate-publication `P2002` errors by reusing the unique `(listingDraftId, marketplaceProviderId)` `ExternalListing` row during `POST /publication-jobs` and creating a new `PublicationJob` inside the same transaction.
- 2026-07-09: Hardened object-by-ID reads so `GET /listings/:id` and `GET /publication-jobs/:id` now require authentication plus owner matching, closing an ID-enumeration data leak in the active Node.js runtime.
- 2026-07-09: Aligned runtime SMTP sender settings with the real `noreply@multiportal.site` mailbox, passed `SMTP_SECURE` / `SMTP_REQUIRE_TLS` through Docker Compose, and confirmed password-reset delivery is accepted by the Home.pl relay on `poczta2602650.home.pl:465`.
- 2026-07-09: Fixed broken listing thumbnails behind public domains by adding a same-origin `/media-files/...` proxy in `apps/web/front-server.js`, returning media URLs through the web origin, and normalizing legacy direct-MinIO / `localhost:9000` photo URLs in API listing responses.
- 2026-07-09: Added SMTP transport mode selection in `apps/api/mail.js` via `SMTP_SECURE` with automatic SSL mode on port `465`, so the app can use either STARTTLS on `587` or implicit TLS on `465`.
- 2026-07-09: Added SMTP startup verification, shorter SMTP timeouts, and delivery-result logging (`messageId`, `accepted`, `rejected`, `response`) so deployed containers can distinguish relay acceptance from later inbox delivery problems.
- 2026-07-09: Added an API container entrypoint that runs `prisma migrate deploy` before starting `apps/api/db-server.js`, reducing VPS deployment failures caused by newer auth code running against an older PostgreSQL schema.
- 2026-07-09: Switched source defaults and runtime SMTP sender config to `noreply@manager.multiportal.site`, added `SMTP_FROM_NAME` / `SMTP_REPLY_TO` / `SMTP_SENDER`, and added optional `API_PUBLIC_URL` / `WEB_PUBLIC_URL` support for public auth links.
- 2026-07-09: Switched frontend API calls to same-origin paths and added `apps/web/front-server.js` proxying for `/auth`, `/listings`, `/providers`, `/marketplace-accounts`, `/publication-jobs`, `/media`, and `/health`, fixing external `Failed to fetch` errors behind VPS/Nginx deployments.
- 2026-07-09: Fixed Docker PostgreSQL healthcheck spam by pointing `pg_isready` at the real application database instead of the username-derived default database.
- 2026-07-09: Added mail configuration warnings and `.env.example` SMTP placeholders so placeholder senders are easier to spot before testing inbox delivery.
- 2026-07-09: Added account activation flow - registration now creates inactive accounts, sends a 1-hour activation link by email, blocks login until activation, and allows inactive accounts to be activated through the forgot-password reset flow.
- 2026-07-09: Added DB-backed login lockout - accounts lock after 5 failed password attempts, login responses now return remaining attempts from PostgreSQL, and only the reset-password flow clears the lock.
- 2026-07-09: Password reset codes now persist in PostgreSQL as SHA-256 hashes with expiry, request timestamp, and attempt counter, so API restarts no longer invalidate pending resets.
- 2026-07-09: Disabled verbose nodemailer transport logging after container verification showed SMTP debug output exposed reset codes and mail transport details in `docker logs`.
- 2026-07-09: Password reset flow hardened - forgot-password now checks for an existing account, sends a 6-digit code via SMTP, verifies the code on reset, persists reset state in the database, and enforces stronger password rules on registration/reset forms.
- 2026-07-08: Fixed DELETE 500 - foreign key RESTRICT on `ListingMedia` blocked deletion. Now deletes related media records first.
- 2026-07-08: Switched photo upload from presigned URL (broken by hostname mismatch in AWS signature) to server-side base64 upload via `POST /media/upload`.
- 2026-07-08: Full photo management CRUD - added `POST/PUT/DELETE /listings/:id/photos` endpoints. Edit modal has drag-reorder grid, delete, set primary, add. Detail modal shows gallery. Create flow: draft first, then upload photos.
- 2026-07-08: Fixed `/media/upload-url` 500 error - P2003 foreign key violation. Now skips DB insert when `listingId` is missing/invalid.
- 2026-07-08: Fixed presigned URLs using internal Docker hostname (`minio:9000`) - added `S3_PUBLIC_ENDPOINT` and public-read bucket policy.
- 2026-07-08: Fixed login bug - `verifyPassword()` TypeError on malformed hash plus PostgreSQL password mismatch in Docker container.
- 2026-07-08: Photo upload feature added to create-listing page (presigned URL upload to MinIO plus preview)
- 2026-07-08: Dashboard shows photo count and thumbnails for each listing
- 2026-07-07: Phase 7 runtime foundations complete - auth, listing CRUD, publication, frontend dashboard, and Dockerized app services are all working together.
