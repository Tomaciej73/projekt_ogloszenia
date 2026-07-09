# Active Context

## Current Phase
**Phase 8 - Provider Research and Auth Hardening** (in progress)

A fully working application is running: user registration/login with JWT Bearer auth and PBKDF2+SHA512 password hashing, password reset flow with SMTP-delivered 6-digit codes, listing draft CRUD stored in PostgreSQL via Prisma, publication job creation with BullMQ, and a web frontend dashboard. Docker Compose includes PostgreSQL 18, Redis 8, MinIO, and optional API+Web containers (`profile: full`).

## Active Decisions

- **Monorepo structure confirmed:** `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/connectors`, `packages/config`
- **Tech stack confirmed:** pnpm workspaces, Node.js 24 LTS, PostgreSQL 18, Prisma v7 (with pg adapter), Redis 8, BullMQ, MinIO/S3
- **Runtime servers:** Plain Node.js HTTP servers (`apps/api/db-server.js`, `apps/web/front-server.js`) instead of NestJS/Next.js builds - chosen for immediate development velocity. NestJS source code exists as reference for future migration.
- **Provider roadmap:** OLX (1st) -> Vinted Pro (2nd) -> Facebook Marketplace (3rd). All `research_required`.
- **Version policy:** Latest LTS for runtimes, latest stable for frameworks, no `latest` Docker tags, verify from official sources.
- **Pinned package manager:** pnpm@11.10.0
- **Workspace protocol:** `workspace:*` for inter-package dependencies
- **Security:** All credentials from `.env` via dotenv. No hardcoded secrets in source code. PBKDF2+SHA512+16B salt for passwords. JWT Bearer auth. Password reset requires a registered email, a one-time 6-digit code, and a strong password (uppercase, lowercase, number, special character).
- **Owner's changes are authoritative:** Port numbers, configuration values, file names chosen by the project owner must not be reverted or "corrected" by AI. See `.clinerules/01-project.md`.
- **Current port assignments (from `.env`):** PostgreSQL 5243, Redis 6739, MinIO API 9000, MinIO Console 9001, API 3001, Web 3000.

## Immediate Next Steps

1. Add rate limiting and resend throttling for `/auth/*` and password reset endpoints.
2. Persist password reset codes outside process memory (DB/Redis) so API restarts do not invalidate pending resets.
3. Implement provider connector interface with real OLX research.
4. Add E2E tests for the main auth, listing, and publication flows.

## Known Unknowns

- OLX official API availability and documentation
- Vinted Pro API requirements
- Facebook Marketplace API access
- Production deployment strategy (container orchestration, cloud provider)

## Recent Changes

- 2026-07-09: Disabled verbose nodemailer transport logging after container verification showed SMTP debug output exposed reset codes and mail transport details in `docker logs`.
- 2026-07-09: Password reset flow hardened - forgot-password now checks for an existing account, sends a 6-digit code via SMTP, verifies the code on reset, and enforces stronger password rules on registration/reset forms.
- 2026-07-08: Fixed DELETE 500 - foreign key RESTRICT on `ListingMedia` blocked deletion. Now deletes related media records first.
- 2026-07-08: Switched photo upload from presigned URL (broken by hostname mismatch in AWS signature) to server-side base64 upload via `POST /media/upload`.
- 2026-07-08: Full photo management CRUD - added `POST/PUT/DELETE /listings/:id/photos` endpoints. Edit modal has drag-reorder grid, delete, set primary, add. Detail modal shows gallery. Create flow: draft first, then upload photos.
- 2026-07-08: Fixed `/media/upload-url` 500 error - P2003 foreign key violation. Now skips DB insert when `listingId` is missing/invalid.
- 2026-07-08: Fixed presigned URLs using internal Docker hostname (`minio:9000`) - added `S3_PUBLIC_ENDPOINT` and public-read bucket policy.
- 2026-07-08: Fixed login bug - `verifyPassword()` TypeError on malformed hash plus PostgreSQL password mismatch in Docker container.
- 2026-07-08: Photo upload feature added to create-listing page (presigned URL upload to MinIO plus preview)
- 2026-07-08: Dashboard shows photo count and thumbnails for each listing
- 2026-07-07: Phase 7 runtime foundations complete - auth, listing CRUD, publication, frontend dashboard, and Dockerized app services are all working together.
