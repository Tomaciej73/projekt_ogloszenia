# Progress

## Current Status
**Phase 7 - BullMQ Worker Integrated and Frontend Publication** (complete, with auth hardening updates on 2026-07-09)

BullMQ worker processes publication jobs from the Redis queue on port 6739. The API pushes publication jobs to the queue instead of using `setTimeout` mocks. The current runtime stack uses plain Node.js servers for API, web, and worker, with JWT auth, SMTP account activation emails, DB-backed login lockout after 5 failed attempts, 6-digit reset codes, and stronger password validation across registration and reset flows.

## Completed

### Infrastructure
- [x] `.clinerules/` - all 5 rules files, including "never revert owner changes"
- [x] pnpm monorepo with 7 workspace packages
- [x] Docker Compose with PostgreSQL 18, Redis 8, MinIO, API (3001), Web (3000)
- [x] Prisma v7 schema with 12 entities and 4 enums
- [x] 5 Prisma migrations applied
- [x] `.env` - all configuration via dotenv, no hardcoded credentials
- [x] `.env.example` - placeholder values only, no real secrets, including SMTP sender placeholders
- [x] `how_to_run.md` - non-technical setup guide
- [x] `AGENTS.md` - AI assistant guidance

### Backend API (`apps/api/db-server.js`) v0.3.0
- [x] `POST /auth/register` - creates inactive accounts, generates activation tokens, sends activation email, and returns activation-required messaging
- [x] `GET /auth/activate` - validates activation link, activates account, and renders an HTML confirmation page
- [x] `POST /auth/login` - login with JWT Bearer token, blocked until account activation, returns DB-backed remaining attempts, and locks the account after 5 failed passwords
- [x] `POST /auth/forgot-password` - validates email/account existence, generates a 6-digit reset code, stores only its DB-backed hash plus expiry metadata, sends it via SMTP, and doubles as the recovery activation path for inactive accounts
- [x] `POST /auth/reset-password` - validates email, DB-backed reset code hash, strong password rules, changes password, clears reset state, unlocks locked accounts, and activates inactive accounts
- [x] `GET /auth/me` - current user info
- [x] `GET /health` - health check with DB status
- [x] `GET/POST /listings` - list/create listing drafts (auth required)
- [x] `GET/PUT/DELETE /listings/:id` - CRUD operations (auth required)
- [x] `POST /publication-jobs` - pushes to BullMQ queue (Redis 6739)
- [x] `GET /publication-jobs/:id` - job status
- [x] `GET /providers` - list marketplace providers
- [x] `GET/POST /marketplace-accounts` - connect provider accounts
- [x] `POST /media/upload-url` - MinIO presigned URL generation
- [x] Email validation (regex), strong password validation (min 8, uppercase, lowercase, number, special character), reset code validation, and input sanitization
- [x] Pretty JSON responses (2-space indent)

### Worker (`apps/worker/worker.js`)
- [x] BullMQ Worker processing `publication` queue
- [x] Connected to Redis on port 6739
- [x] Mock connector simulates external API calls
- [x] 3 retry attempts with exponential backoff (2s, 4s, 8s)

### Frontend (`apps/web/`)
- [x] `public/index.html` - landing page with Login/Register tabs, activation-aware registration/login messaging, DB-synced remaining login-attempt messaging, same-origin API calls, forgot-password flow, reset code entry, and stronger password guidance
- [x] `public/create-listing.html` - listing creation form
- [x] `public/dashboard.html` - publication dashboard: list listings, select provider, publish
- [x] `public/register.html` - standalone registration page with strong password rules and activation-required messaging
- [x] `public/login.html` - standalone login page with inactive/locked-account recovery hint and DB-synced remaining login-attempt messaging
- [x] `front-server.js` - static file server plus same-origin API proxy for VPS/Nginx deployment
- [x] Dashboard after login with listing list and stats
- [x] Session persistence via localStorage (survives refresh/new tab)

### Security
- [x] All credentials only from `.env` via dotenv
- [x] PBKDF2 + SHA512 + 100k iterations + 16B random salt
- [x] JWT Bearer authentication
- [x] Account activation via 1-hour email link with DB-backed activation token hash
- [x] Account lockout after 5 failed login attempts, cleared only by successful password reset
- [x] One-time 6-digit password reset codes with 1-hour expiry and DB-backed hashed persistence
- [x] SMTP debug transport logging disabled to avoid leaking reset codes or mail transport details in container logs
- [x] Mail config warnings for placeholder/misaligned SMTP sender settings
- [x] Runtime SMTP config supports explicit `SMTP_FROM_NAME`, `SMTP_REPLY_TO`, `SMTP_SENDER`, and optional public URL envs for domain-based auth links
- [x] No hardcoded passwords, tokens, or secrets in source code
- [x] `.env` git-ignored, `.env.example` has placeholders only

## Pending (Next Steps)

### Phase 8 - Provider Integration and Auth Hardening
1. Add rate limiting and resend throttling for `/auth/*` and password reset endpoints.
2. Add automated auth coverage for activation, forgot-password, and restart persistence.
3. Research OLX official API documentation.
4. Implement OLX connector.
5. Research Vinted Pro and Facebook Marketplace APIs.

### Phase 9 - Testing
6. Add backend unit tests (Jest)
7. Add frontend component tests (Vitest)
8. Add E2E tests (Playwright)

## Known Issues
- NestJS source code exists but is not used at runtime (plain Node.js servers are active instead).
- 2 build scripts remain blocked (`msgpackr-extract`, `sharp`) - needed for Next.js builds, not blocking current development.
- Auth endpoints still need rate limiting and resend throttling.
- Real inbox delivery still depends on a verified `SMTP_FROM` sender and aligned SPF/DKIM/DMARC for the chosen SMTP relay.

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
