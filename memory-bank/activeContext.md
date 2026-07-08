# Active Context

## Current Phase
**Phase 4 — Functional Application with Auth & Listing CRUD** (in progress)

A fully working application is running: user registration/login with PBKDF2+SHA512 password hashing, password reset flow, listing draft CRUD stored in PostgreSQL via Prisma, publication job creation with mock connector, and a web frontend dashboard. Docker Compose includes PostgreSQL 18, Redis 8, MinIO, and optional API+Web containers (`profile: full`).

## Active Decisions

- **Monorepo structure confirmed:** `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/connectors`, `packages/config`
- **Tech stack confirmed:** pnpm workspaces, Node.js 24 LTS, PostgreSQL 18, Prisma v7 (with pg adapter), Redis 8, BullMQ, MinIO/S3
- **Runtime servers:** Plain Node.js HTTP servers (`apps/api/db-server.js`, `apps/web/front-server.js`) instead of NestJS/Next.js builds — chosen for immediate development velocity. NestJS source code exists as reference for future migration.
- **Provider roadmap:** OLX (1st) → Vinted Pro (2nd) → Facebook Marketplace (3rd). All `research_required`.
- **Version policy:** Latest LTS for runtimes, latest stable for frameworks, no `latest` Docker tags, verify from official sources.
- **pinned packageManager:** pnpm@11.10.0
- **Workspace protocol:** `workspace:*` for inter-package dependencies
- **Security:** All credentials from `.env` via dotenv. No hardcoded secrets in source code. PBKDF2+SHA512+16B salt for passwords. Bearer token auth with in-memory session store.
- **Owner's changes are authoritative:** Port numbers, configuration values, file names chosen by the project owner must not be reverted or "corrected" by AI. See `.clinerules/01-project.md`.
- **Current port assignments (from `.env`):** PostgreSQL 5243, Redis 6739, MinIO API 9000, MinIO Console 9001, API 3001, Web 3000.

## Immediate Next Steps

1. ~~Initialize monorepo~~ ✓
2. ~~Docker Compose with PostgreSQL, Redis, MinIO~~ ✓
3. ~~Prisma schema + migrations~~ ✓
4. ~~User registration and login~~ ✓
5. ~~Password reset flow~~ ✓
6. ~~Input validation and sanitization~~ ✓
7. ~~Listing draft CRUD (Prisma-backed)~~ ✓
8. ~~Publication job creation with mock connector~~ ✓
9. ~~Frontend dashboard with auth~~ ✓
10. ~~Docker containers for API and Web~~ ✓
11. Add proper JWT auth (replace in-memory token store)
12. Add media upload with MinIO presigned URLs
13. Add BullMQ worker for async publication jobs
14. Implement provider connector interface with real OLX research
15. Add E2E tests for main user flow
16. Add email sending for password reset (currently logged to console)

## Known Unknowns

- OLX official API availability and documentation
- Vinted Pro API requirements
- Facebook Marketplace API access
- Production deployment strategy (container orchestration, cloud provider)

## Recent Changes

- 2026-07-08: Fixed DELETE 500 — foreign key RESTRICT on `ListingMedia` blocked deletion. Now deletes related media records first.
- 2026-07-08: Switched photo upload from presigned URL (broken by hostname mismatch in AWS signature) to server-side base64 upload via `POST /media/upload`.
- 2026-07-08: Full photo management CRUD — added `POST/PUT/DELETE /listings/:id/photos` endpoints. Edit modal has drag-reorder grid, delete, set primary, add. Detail modal shows gallery. Create flow: draft first, then upload photos.
- 2026-07-08: Fixed `/media/upload-url` 500 error — P2003 foreign key violation. Now skips DB insert when `listingId` is missing/invalid.
- 2026-07-08: Fixed presigned URLs using internal Docker hostname (`minio:9000`) — added `S3_PUBLIC_ENDPOINT` and public-read bucket policy.
- 2026-07-08: Fixed login bug — `verifyPassword()` TypeError on malformed hash + PostgreSQL password mismatch in Docker container.
- 2026-07-08: Photo upload feature added to create-listing page (presigned URL upload to MinIO + preview)
- 2026-07-08: Dashboard shows photo count and thumbnails for each listing
- 2026-07-07: Phase 4 — functional app running: auth, listing CRUD, publication, frontend dashboard
- 2026-07-07: Docker Compose extended with `api` and `web` service containers (`profile: full`)
- 2026-07-07: Password reset flow added (`/auth/forgot-password`, `/auth/reset-password`)
- 2026-07-07: Email validation (regex) and input sanitization (HTML strip, trim) implemented
- 2026-07-07: `.env` DRY refactor — URL variables reference other `.env` variables
- 2026-07-07: Rule added to `.clinerules`: never revert owner's changes (e.g. port numbers)
- 2026-07-07: Phase 3 complete — all scaffolding and CRUD endpoints working
- 2026-07-07: Phase 1-2 complete — monorepo, Docker, Prisma, shared packages
