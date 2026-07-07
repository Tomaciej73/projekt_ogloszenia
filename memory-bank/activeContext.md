# Active Context

## Current Phase
**Phase 2 — Shared Configuration & Foundations** (complete)

All source scaffolding is done: shared config, enums/types, Prisma schema (12 entities + 4 enums), NestJS API shell (11 modules), worker shell, Next.js frontend shell, connector interface + MockConnector. Next step: Phase 3 — listing draft CRUD flow (first vertical slice).

## Active Decisions
- Monorepo structure confirmed: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/connectors`, `packages/config`
- Tech stack confirmed: pnpm workspaces, Next.js (frontend), NestJS (backend + worker), PostgreSQL, Prisma, Redis + BullMQ, MinIO/S3, Jest/Vitest/Playwright
- Provider roadmap confirmed: OLX (1st), Vinted Pro (2nd), Facebook Marketplace (3rd)
- All providers currently `research_required` — no real integrations to be implemented yet
- Version policy: latest LTS for runtimes, latest stable for frameworks, no `latest` Docker tags, verify from official sources
- pnpm 11.10.0 pinned as packageManager in root `package.json`
- Workspace protocol (`workspace:*`) used for inter-package dependencies

## Immediate Next Steps (In Order)
1. ~~Read README.md, .clinerules/, memory-bank/~~ ✓
2. ~~Populate all 6 memory-bank files~~ ✓
3. ~~Initialize pnpm monorepo with workspace configuration~~ ✓
4. ~~Create `docker-compose.yml` with PostgreSQL, Redis, MinIO~~ ✓
5. ~~Create `.env.example` with all placeholder variables~~ ✓
6. ~~Create `AGENTS.md`~~ ✓
7. ~~Create `.gitignore`~~ ✓
8. ~~Create `packages/config/src/` — Zod environment validation schema + validated config loader~~ ✓
9. ~~Create `packages/shared/src/` — shared enums for ListingDraftStatus, ExternalListingStatus, PublicationJobStatus, IntegrationStatus~~ ✓
10. ~~Create initial Prisma schema with all 12 core entities and 3 status enums in `apps/api/prisma/`~~ ✓
11. ~~Scaffold `apps/api/src/` — NestJS bootstrap, AppModule, 11 module stubs~~ ✓
12. ~~Scaffold `apps/worker/src/` — NestJS standalone bootstrap, queue definitions~~ ✓
13. ~~Scaffold `apps/web/src/` — Next.js App Router, layout + homepage~~ ✓
14. ~~Create `packages/connectors/src/` — `MarketplaceConnector` interface, `ProviderCapabilities` type, `MockConnector`~~ ✓
15. Build listing draft CRUD flow (first complete vertical slice)
16. Research OLX official API

## Known Unknowns
- OLX official API availability, documentation, and limitations
- Vinted Pro API availability and requirements
- Facebook Marketplace API availability and requirements
- Authentication strategy details (exact cookie/token mechanism TBD)
- Token encryption mechanism (application-level encryption library TBD)
- CSRF protection implementation details for the chosen auth strategy
- Exact Prisma schema details (will be designed in Phase 3)
- Node.js and pnpm not yet installed — dependency installation and version verification pending

## Recent Changes
- 2026-07-07: Phase 2 complete — all scaffolding done: shared config, enums, Prisma schema, NestJS API (11 modules), worker, Next.js shell, connector interface + MockConnector
- 2026-07-07: Local dev setup guide added to README.md and AGENTS.md with PowerShell commands
- 2026-07-07: Environment verified — Node.js 24.18.0, pnpm 11.10.0, Git 2.55, Docker 29.6.1, Docker Compose 5.2.0 all present
- 2026-07-07: Phase 1 complete — monorepo scaffolded with 6 workspace packages, Docker Compose, .env.example, AGENTS.md, .gitignore
- 2026-07-07: Version verification policy established across README, .clinerules/03-workflow.md, and techContext.md
- 2026-07-07: README.md formatting fixed (unclosed code blocks, missing headings)
- 2026-07-07: `.clinerules/05-language-and-output.md` created
- 2026-07-07: Memory bank files fully populated
- 2026-07-07: Provider roadmap established with OLX as first priority