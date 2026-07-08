# Progress

## Current Status
**Phase 7 — BullMQ Worker Integrated & Frontend Publication** (complete)

BullMQ worker processes publication jobs from Redis queue (port 6739). API pushes jobs to queue instead of using setTimeout mocks. Frontend dashboard (`/dashboard`) with publication flow for all 3 providers (OLX, Vinted Pro, Facebook Marketplace). JWT auth + MinIO presigned URLs + PBKDF2 password hashing.

## Completed

### Infrastructure
- [x] `.clinerules/` — all 5 rules files, including "never revert owner changes"
- [x] pnpm monorepo with 7 workspace packages
- [x] Docker Compose with PostgreSQL 18, Redis 8, MinIO, API (3001), Web (3000)
- [x] Prisma v7 schema with 12 entities + 4 enums
- [x] 2 Prisma migrations applied
- [x] `.env` — all configuration via dotenv, no hardcoded credentials
- [x] `.env.example` — placeholder values only, no real secrets
- [x] `how_to_run.md` — non-technical setup guide
- [x] `AGENTS.md` — AI assistant guidance

### Backend API (`apps/api/db-server.js`) v0.3.0
- [x] `POST /auth/register` — registration with validation
- [x] `POST /auth/login` — login with JWT Bearer token
- [x] `POST /auth/forgot-password` — generates reset token (1h expiry)
- [x] `POST /auth/reset-password` — verifies token, changes password
- [x] `GET /auth/me` — current user info
- [x] `GET /health` — health check with DB status
- [x] `GET/POST /listings` — list/create listing drafts (auth required)
- [x] `GET/PUT/DELETE /listings/:id` — CRUD operations (auth required)
- [x] `POST /publication-jobs` — pushes to BullMQ queue (Redis 6739)
- [x] `GET /publication-jobs/:id` — job status
- [x] `GET /providers` — list marketplace providers
- [x] `GET/POST /marketplace-accounts` — connect provider accounts
- [x] `POST /media/upload-url` — MinIO presigned URL generation
- [x] Email validation (regex), password validation (min 8, max 128)
- [x] Input sanitization (HTML strip, trim, normalize whitespace)
- [x] Pretty JSON responses (2-space indent)

### Worker (`apps/worker/worker.js`)
- [x] BullMQ Worker processing `publication` queue
- [x] Connected to Redis on port 6739
- [x] Mock connector simulates external API calls
- [x] 3 retry attempts with exponential backoff (2s, 4s, 8s)

### Frontend (`apps/web/`)
- [x] `public/index.html` — landing page with Login/Register tabs + Forgot Password
- [x] `public/create-listing.html` — listing creation form
- [x] `public/dashboard.html` — publication dashboard: list listings, select provider, publish
- [x] Dashboard after login with listing list + stats
- [x] Session persistence via localStorage (survives refresh/new tab)

### Security
- [x] All credentials only from `.env` via dotenv
- [x] PBKDF2 + SHA512 + 100k iterations + 16B random salt
- [x] Crypto-strong token/secrets (crypto.randomBytes)
- [x] No hardcoded passwords, tokens, or secrets in source code
- [x] `.env` git-ignored, `.env.example` has placeholders only

## Pending (Next Steps)

### Phase 8 — Provider Integration
1. Research OLX official API documentation
2. Implement OLX connector
3. Research Vinted Pro, Facebook Marketplace APIs

### Phase 9 — Testing
4. Add backend unit tests (Jest)
5. Add frontend component tests (Vitest)
6. Add E2E tests (Playwright)

## Known Issues
- NestJS source code exists but not used at runtime (plain Node.js servers instead)
- 2 build scripts blocked (msgpackr-extract, sharp) — needed for Next.js builds, not blocking dev
- Password reset tokens are logged to console (dev mode only)

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
| 2026-07-07 | Prisma v7 + pg adapter | Required for Prisma 7+ |
| 2026-07-07 | Zod for config validation | Lightweight, TypeScript-native |
| 2026-07-08 | BullMQ for async publication | Reliable job processing with Redis, retries, persistent queue |
| 2026-07-08 | JWT (jsonwebtoken) for authentication | Stateless, industry standard, replaces in-memory session store |