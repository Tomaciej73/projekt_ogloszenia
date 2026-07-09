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
- `apps/api/docker-entrypoint.sh` runs `prisma migrate deploy` and then starts `apps/api/db-server.js`
- `apps/api/db-server.js` handles the active REST API runtime
- `apps/worker/worker.js` processes BullMQ jobs

Next.js and NestJS source scaffolding remains in the repository, but those entry points are not the active runtime today.

## Version Policy

All dependency versions must follow the project policy defined in `.clinerules/03-workflow.md` and `README.md`:

1. Verify the latest stable or latest LTS version from official sources before pinning.
2. Prefer latest LTS for runtimes such as Node.js.
3. Prefer latest stable versions for frameworks and libraries unless compatibility issues are documented.
4. Do not guess versions.
5. Do not use `latest` Docker tags for production-oriented configuration.
6. Document checked dates and source types here.

## Verified Versions

Checked 2026-07-07 via official/npm/Docker sources.

### Runtime

| Runtime | Version | Policy | Source |
|--------|---------|--------|--------|
| Node.js | 24.18.0 | Latest LTS baseline | nodejs.org |
| Node.js Current | 26.4.0 | Current release, not production baseline | nodejs.org |

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
| BullMQ | 5.79.3 | npm registry |
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

## Environment Variables

Key `.env` groups:

- **Database:** `DATABASE_URL`
- **Redis:** `REDIS_URL`
- **Storage:** `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **Auth:** `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`
- **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- **SMTP transport mode:** optional `SMTP_SECURE` plus optional `SMTP_REQUIRE_TLS`
- **Encryption:** `TOKEN_ENCRYPTION_KEY`
- **App:** `API_PORT`, `WEB_PORT`, `NODE_ENV`, `LOG_LEVEL`, `API_PROXY_URL`, optional `API_PUBLIC_URL`, optional `WEB_PUBLIC_URL`
- **Provider OAuth (future):** `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, etc.

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
- `User` now includes activation, login lockout, and password reset state fields: `isActive`, `activatedAt`, `failedLoginAttempts`, `lockedAt`, `activationTokenHash`, `activationTokenExpiresAt`, `passwordResetCodeHash`, `passwordResetCodeExpiresAt`, `passwordResetRequestedAt`, and `passwordResetAttempts`

## Queue System

- Active queue: `publication`
- Backed by Redis on port `6739`
- Worker retries use exponential backoff
- Queue processing is handled by `apps/worker/worker.js`

## Auth and Security Notes

- Authentication uses JWT Bearer tokens.
- Registration creates inactive accounts until email activation is completed.
- Accounts lock after 5 failed login attempts and stay locked until the password reset flow completes successfully.
- Account activation links use DB-backed token hashes with 1-hour expiry.
- Passwords use PBKDF2 + SHA512 + 100k iterations + 16-byte random salts.
- Password reset uses SMTP-delivered 6-digit codes with 1-hour expiry.
- Reset codes are stored in PostgreSQL as SHA-256 hashes scoped to the user ID, with expiry, request timestamp, and invalid-attempt counter.
- Login responses can return DB-backed `remainingLoginAttempts` and `accountLocked` flags so the frontend stays synchronized with the actual lock state.
- Inactive accounts can also be activated through the forgot-password reset flow after mailbox verification.
- Mailer warns at startup when `SMTP_FROM` is missing, still uses the `noreply@manager.multiportal.site` default sender, or otherwise looks misaligned with the SMTP relay setup.
- Mailer now also verifies the SMTP transport at startup and logs the relay response plus `accepted` / `rejected` recipients after each send.
- Mail transport automatically uses implicit SSL/TLS when `SMTP_SECURE=true` or `SMTP_PORT=465`; otherwise it defaults to STARTTLS with `SMTP_REQUIRE_TLS=true`.
- API runtime can honor optional `API_PUBLIC_URL` and `WEB_PUBLIC_URL` environment variables to avoid generating auth links with `localhost` when the app is exposed behind a public domain.
- SMTP relay acceptance alone is not enough for Gmail/Onet inbox delivery; verified sender mailbox plus aligned SPF/DKIM/DMARC remain required.
- Verbose nodemailer transport logging is disabled in runtime to avoid leaking reset codes or SMTP session details into container logs.
- Strong password rules are enforced on registration and password reset:
  - minimum 8 characters
  - at least one lowercase letter
  - at least one uppercase letter
  - at least one number
  - at least one special character
- Never log passwords, reset codes, tokens, cookies, authorization headers, API keys, or encryption keys.

## Testing Strategy

- Backend: Jest unit and integration tests
- Frontend: Vitest plus Testing Library
- E2E: Playwright
- Current turn validation used syntax checks, container restarts, startup `prisma migrate deploy`, and `curl`-driven auth flow verification; automated coverage is still pending

## Constraints

- No hardcoded configuration values
- No absolute file paths
- No secrets in source code or version control
- All external URLs and credentials must come from environment variables
- Provider-specific logic must stay isolated in connector packages
- Fail-fast validation should happen at startup for required configuration
