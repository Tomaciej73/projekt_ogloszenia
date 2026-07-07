# Technical Context

## Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | Web application |
| Frontend Language | TypeScript | Type-safe frontend code |
| Frontend Styling | Tailwind CSS | Utility-first styling |
| UI Components | shadcn/ui | Accessible React components |
| Backend | NestJS | REST API server |
| Backend Language | TypeScript | Type-safe backend code |
| Worker | NestJS (standalone) | Background job processing |
| Database | PostgreSQL | Primary data store |
| ORM | Prisma | Database schema & queries |
| Queue/Cache | Redis + BullMQ | Job queue for publication workers |
| File Storage | MinIO (local) / S3 (prod) | Listing media storage |
| Package Manager | pnpm | Monorepo workspace management |
| Monorepo Tool | pnpm workspaces | Multi-package repository |
| Validation | Zod | Schema validation (config & inputs) |
| Testing (Backend) | Jest | Unit & integration tests |
| Testing (Frontend) | Vitest + Testing Library | Component & unit tests |
| Testing (E2E) | Playwright | End-to-end browser tests |
| Local Dev | Docker Compose | PostgreSQL, Redis, MinIO |

## Version Policy

All dependency versions must follow the project version verification policy defined in `.clinerules/03-workflow.md` and `README.md`:

1. Verify the latest stable or latest LTS version from official sources before pinning.
2. Prefer latest LTS for runtimes (Node.js).
3. Prefer latest stable for frameworks and libraries unless compatibility issues are documented.
4. Do not use outdated baseline versions without a clear reason.
5. Do not use `latest` Docker tags for production-oriented configuration.
6. Document checked dates and source types in this file.
7. If the exact current version cannot be verified, stop and ask instead of guessing.

### Verified Versions (checked 2026-07-07 via npm registry)

| Tool | Version | Source | Notes |
|------|---------|--------|-------|
| pnpm | 11.10.0 | npm registry | Latest stable |
| Next.js | 16.2.10 | npm registry | Latest stable |
| NestJS (core) | 11.1.27 | npm registry | Latest stable |
| Prisma | 7.8.0 | npm registry | Latest stable |

### Versions Requiring Verification (not yet checked)

| Tool | Expected Baseline | Verification Needed |
|------|------------------|---------------------|
| Node.js | Latest LTS (likely 24.x) | Official nodejs.org release page |
| PostgreSQL | Latest stable (likely 17.x) | Official postgresql.org |
| Redis | Latest stable (likely 8.x) | Official redis.io |
| MinIO | Latest stable | Official min.io release page |
| Zod | Latest stable | npm registry |
| BullMQ | Latest stable | npm registry |
| Tailwind CSS | Latest stable | npm registry |
| Jest | Latest stable | npm registry |
| Vitest | Latest stable | npm registry |
| Playwright | Latest stable | npm registry |
| React Hook Form | Latest stable | npm registry |
| shadcn/ui | Latest compatible | shadcn/ui docs (not an npm package) |

> **Note:** These versions will be verified when Node.js and pnpm are installed in the development environment and `pnpm add` is used with `@latest`. Until then, the baseline versions above are placeholders.

## Development Environment

### Prerequisites
- Node.js latest LTS (verify at https://nodejs.org — checked date and version TBD)
- pnpm 11+ (latest stable: 11.10.0 as of 2026-07-07)
- Docker & Docker Compose
- Git

### Docker Compose Services
```yaml
services:
  postgres:
    image: postgres:17-alpine
    ports: [5432]
    environment: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
    volumes: pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: [6379]
    volumes: redisdata:/data

  minio:
    image: minio/minio:RELEASE.2025-06-26T23-31-55Z
    ports: [9000, 9001]
    environment: MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
    volumes: miniodata:/data
    command: server /data --console-address ":9001"
```

> **Note:** Docker image tags above are placeholder targets. PostgreSQL 17, Redis 8, and the latest stable MinIO tag must be verified from official sources before the actual `docker-compose.yml` is created. The `minio/minio:latest` tag must not be used.

### Environment Variables (`.env.example` placeholder categories)
- **Database**: `DATABASE_URL`
- **Redis**: `REDIS_URL`
- **S3/MinIO**: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **Auth**: `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`
- **Encryption**: `TOKEN_ENCRYPTION_KEY` (32-byte hex for AES-256)
- **App**: `API_PORT`, `WEB_PORT`, `NODE_ENV`, `LOG_LEVEL`
- **Provider OAuth** (future): `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, etc.

## Package Structure

```
apps/web/           — Next.js frontend
  tsconfig.json
  package.json
  next.config.ts
  tailwind.config.ts
  src/
    app/            — App Router pages
    components/     — React components
    hooks/          — Custom hooks
    lib/            — Utilities

apps/api/           — NestJS REST API
  tsconfig.json
  package.json
  src/
    main.ts         — Bootstrap
    app.module.ts   — Root module
    modules/        — Feature modules
    common/         — Guards, filters, interceptors, decorators
    prisma/         — Prisma service

apps/worker/        — NestJS standalone worker
  tsconfig.json
  package.json
  src/
    main.ts         — Bootstrap (no HTTP server)
    processors/     — BullMQ job processors
    queues/         — Queue definitions

packages/shared/    — Shared DTOs, types, enums, validation schemas
  tsconfig.json
  package.json
  src/
    types/
    enums/
    dtos/
    schemas/
    constants/

packages/connectors/ — Connector interface + provider implementations
  tsconfig.json
  package.json
  src/
    interfaces/     — MarketplaceConnector interface
    capabilities/   — ProviderCapabilities type
    mock/           — MockConnector for development
    olx/            — OLX connector (future)
    vinted/         — Vinted connector (future)
    facebook/       — Facebook Marketplace connector (future)

packages/config/    — Environment config validation
  tsconfig.json
  package.json
  src/
    schema.ts       — Zod schemas
    config.ts       — Validated config loader
    index.ts
```

## Database

### ORM: Prisma
- Schema file: `apps/api/prisma/schema.prisma`
- Migrations: `prisma migrate dev`
- Client generation: `prisma generate`
- Prisma service exposed as NestJS provider (singleton)

### Key Schema Decisions
- All IDs use UUIDs
- Timestamps via `@default(now())` and `@updatedAt`
- Token fields use `String` / `@db.Text` (not `VarChar(255)`)
- Statuses stored as enums in Prisma schema
- Soft deletes considered but not default

## Queue System

### BullMQ + Redis
- Queue names (planned):
  - `publication` — Publishing listings to marketplaces
  - `status-sync` — Syncing external listing statuses
  - `webhooks` — Processing incoming provider webhooks
- Retry strategy: exponential backoff, configurable max attempts
- Dead letter queue for permanently failed jobs
- Job events logged to audit trail

## Testing Strategy

### Backend (Jest)
- Unit tests: services, validators, connector logic
- Integration tests: API endpoints with test database
- Mock provider clients for connector tests
- Configuration validation tests

### Frontend (Vitest + Testing Library)
- Component tests: form validation, status displays
- Hook tests: API interaction hooks
- Utility tests: formatting, validation

### E2E (Playwright)
- User signup/login flow
- Listing draft creation and editing
- Media upload
- Provider selection and publication
- Status dashboard

## Security Implementation Notes

### Authentication
- Strategy TBD (likely HttpOnly secure cookies + JWT or session-based)
- CSRF protection for state-changing requests
- Rate limiting on `/auth/*` and publication endpoints

### Token Storage
- Provider credentials encrypted at rest
- Application-level encryption using Node.js `crypto` module
- AES-256-GCM with random IV per encryption
- Encryption key from environment variable, never logged

### Logging Rules
- Never log: passwords, tokens, cookies, authorization headers, API keys, HMAC secrets, encryption keys
- Use redacted placeholder (`[REDACTED]`) for sensitive values in logs
- Audit log captures metadata (user ID, action, timestamp, provider, external listing ID) but never secrets

## Constraints
- No hardcoded configuration values anywhere
- No absolute file paths
- No secrets in source code or version control
- All external URLs and credentials from environment variables
- Provider-specific code isolated in connector packages
- Fail-fast validation at startup for all required configuration