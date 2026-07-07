# Progress

## Current Status
**Phase 3 — Listing Draft CRUD Flow** (in progress)

The first vertical slice is being built: listing drafts can be created, read, updated, and deleted via the REST API with an in-memory service.

The monorepo structure is initialized with all workspace packages, Docker Compose services, environment configuration, and project guidance files. No application source code exists yet.

## Completed
- [x] `.clinerules/` files reviewed — all five rules files complete and aligned with README
- [x] Provider roadmap established: OLX (1st) → Vinted Pro (2nd) → Facebook Marketplace (3rd)
- [x] All providers set to `research_required` status — no real integrations to implement yet
- [x] All six `memory-bank/` files created and populated
- [x] `README.md` formatting fixed — all code blocks closed, all headings present
- [x] Version verification policy established — documented in README, .clinerules, and techContext.md
- [x] `pnpm-workspace.yaml` — monorepo workspace configuration
- [x] Root `package.json` — workspace scripts, engine constraints, packageManager pin
- [x] `tsconfig.base.json` — shared TypeScript base config
- [x] `packages/config/` — package stub with tsconfig, Zod dependency
- [x] `packages/shared/` — package stub with tsconfig, Zod dependency
- [x] `packages/connectors/` — package stub with tsconfig, depends on @multiportal/shared
- [x] `apps/api/` — NestJS package stub with tsconfig, core dependencies, decorator support
- [x] `apps/worker/` — NestJS package stub with tsconfig, BullMQ + ioredis, decorator support
- [x] `apps/web/` — Next.js package stub with tsconfig, React 19, Tailwind CSS 4
- [x] `docker-compose.yml` — PostgreSQL 18, Redis 8, MinIO with healthchecks (volume path fixed for PG18)
- [x] `.env.example` — all placeholder variables for DB, Redis, S3, auth, encryption, app
- [x] `AGENTS.md` — AI assistant guidance file
- [x] `.gitignore` — comprehensive ignore rules for the monorepo

## Pending (Next Steps)
1. ~~Run `pnpm install` to install all workspace dependencies~~ ✓ (151 packages, @prisma/client, prisma CLI)
2. ~~Run `npx prisma migrate dev` to apply the database schema~~ ✓ (20260707195108_init)
3. Replace in-memory ListingsService with Prisma-backed persistence
4. Implement proper authentication (currently hardcoded userId)
5. Add media upload endpoint (MinIO integration)
6. Add publication job creation endpoint (worker + MockConnector)
7. Add proper error handling with HTTP status codes (NotFound, BadRequest)
8. Add validation pipes and class-validator decorators
9. Research OLX official API — document integration status, capabilities, limitations

## Known Issues
- PostgreSQL 18 requires `/var/lib/postgresql` volume mount (not `/var/lib/postgresql/data`) — fixed in docker-compose.yml
- NestJS `nest start` is not available in the monorepo without `@nestjs/cli` installed — `ts-node` or a custom build script needed to actually run the API
- 2 build scripts blocked (msgpackr-extract, sharp) — needed for Next.js production builds, not blocking dev mode

## Blocked
- No blockers currently

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-07 | pnpm workspaces for monorepo | Consistent with task requirements, efficient dependency management |
| 2026-07-07 | NestJS for both API and worker | Shared module structure, consistent patterns, same language/ecosystem |
| 2026-07-07 | Zod for config validation | Lightweight, TypeScript-native, good error messages |
| 2026-07-07 | AES-256-GCM for token encryption | Industry standard, authenticated encryption, available in Node.js crypto |
| 2026-07-07 | OLX as first provider priority | Most commonly listed first in project documentation |
| 2026-07-07 | All providers start as `research_required` | No official API documentation reviewed yet — must research before implementing |
| 2026-07-07 | Text type for token DB fields | OAuth tokens and refresh tokens can exceed varchar(255) |
| 2026-07-07 | "Latest stable / latest LTS" version policy | Ensures current versions are used; prevents stale baselines; requires verification from official sources before pinning |
| 2026-07-07 | No `latest` Docker tags in production config | `latest` is non-deterministic; explicit tags ensure reproducible environments |
| 2026-07-07 | Version verification documented in techContext.md | Provides single source of truth for checked dates and sources; unverified versions listed as requiring verification |
| 2026-07-07 | PostgreSQL 18 volume path `/var/lib/postgresql` | PG18 changed data directory layout; not backwards-compatible with `/var/lib/postgresql/data` |
| 2026-07-07 | In-memory ListingsService for Phase 3 | Allows testing CRUD endpoints without full Prisma wiring; replaces later with DB persistence |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-07 | pnpm workspaces for monorepo | Consistent with task requirements, efficient dependency management |
| 2026-07-07 | NestJS for both API and worker | Shared module structure, consistent patterns, same language/ecosystem |
| 2026-07-07 | Zod for config validation | Lightweight, TypeScript-native, good error messages |
| 2026-07-07 | AES-256-GCM for token encryption | Industry standard, authenticated encryption, available in Node.js crypto |
| 2026-07-07 | OLX as first provider priority | Most commonly listed first in project documentation |
| 2026-07-07 | All providers start as `research_required` | No official API documentation reviewed yet — must research before implementing |
| 2026-07-07 | Text type for token DB fields | OAuth tokens and refresh tokens can exceed varchar(255) |
| 2026-07-07 | "Latest stable / latest LTS" version policy | Ensures current versions are used; prevents stale baselines; requires verification from official sources before pinning |
| 2026-07-07 | No `latest` Docker tags in production config | `latest` is non-deterministic; explicit tags ensure reproducible environments |
| 2026-07-07 | Version verification documented in techContext.md | Provides single source of truth for checked dates and sources; unverified versions listed as requiring verification |

## Test Status
- No tests exist yet (no code to test)
- Test infrastructure will be set up alongside each application scaffold