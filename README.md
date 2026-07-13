# MultiPortal Listing Manager

## Overview

MultiPortal Listing Manager is a web application for creating, managing and publishing marketplace listings across multiple external platforms from one central interface.

The goal is to let users create a listing draft once and publish it to selected marketplace platforms such as OLX, Vinted Pro, Facebook Marketplace and future providers, depending on available official or partner API access.

The application must be designed as a secure, configurable and provider-agnostic system. It must not rely on hardcoded configuration, hardcoded file paths, private APIs, scraping or browser automation by default.

## Product Concept

A user should be able to:

1. Create an account in this application.
2. Connect supported external marketplace accounts.
3. Create a listing draft with title, description, price, category, attributes, photos, location and delivery options.
4. Select target marketplaces from a list of connected providers.
5. Publish the listing to selected marketplaces.
6. See publication status per marketplace.
7. Update, unpublish, relist or sync listings where the provider supports it.

The listing creation flow should feel similar to creating an offer on a marketplace platform, but the final step allows publishing to multiple connected platforms.

## Important Marketplace API Constraint

Do not assume that every marketplace has a public API for normal user accounts.

Every marketplace integration must have a documented integration status:

- `official_api`
- `partner_api_required`
- `pro_account_required`
- `manual_export_only`
- `unsupported`
- `research_required`

The default integration strategy is official API first.

Do not implement scraping, private APIs, browser automation, cookie-based login automation or UI automation for publishing unless explicitly approved by the project owner and documented as a known legal, technical and maintenance risk.

## Recommended Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Redis
- BullMQ

### Worker

- Separate background worker process for publishing jobs, retries, synchronization and webhook processing.

### Storage

- S3-compatible object storage.
- MinIO for local development.
- Production provider must be configurable.

### Testing

- Jest for backend unit and integration tests.
- Vitest and Testing Library for frontend tests.
- Playwright for end-to-end tests.

### Local Development

- Docker Compose for PostgreSQL, Redis and MinIO.
- Environment variables validated at application startup.
- `.env.example` must contain placeholders only.

## Local Development Setup Guide

Follow these steps to set up the project on a Windows machine with PowerShell.

### 1. Prerequisites

Install the required tools:

- **Node.js 24 LTS** — Download from https://nodejs.org (choose LTS)
- **pnpm** — Install via npm after Node.js is installed:
  ```powershell
  npm install -g pnpm
  ```
- **Git** — Download from https://git-scm.com
- **Docker Desktop** — Download from https://www.docker.com/products/docker-desktop (includes Docker Compose)
- **WSL 2** — Docker Desktop requires WSL 2 on Windows. Install via PowerShell as Administrator:
  ```powershell
  wsl --install
  ```

### 2. Verify Installations

Run these commands and confirm each returns a version number:

```powershell
node --version
# Expected: v24.x.x (LTS)

pnpm --version
# Expected: 11.x.x

git --version
# Expected: git version 2.x.x

docker --version
# Expected: Docker version 29.x.x

docker compose version
# Expected: Docker Compose version v5.x.x
```

### 3. Clone and Configure

```powershell
# Clone the repository
git clone <repository-url> multiportal-listing-manager
cd multiportal-listing-manager

# Copy environment configuration
copy .env.example .env

# (Optional) Edit .env with custom values
# notepad .env
```

### 4. Start Docker Services

```powershell
# Start PostgreSQL, Redis and MinIO in the background
docker compose up -d

# Verify all services are healthy
docker compose ps
```

To stop services later:

```powershell
docker compose down
```

To stop and remove all data volumes:

```powershell
docker compose down -v
```

### Production deployment

`docker-compose.yml` is the local-development base and intentionally publishes PostgreSQL, Redis, MinIO, its console, API, and web ports for local diagnostics. Do not deploy it by itself to a VPS.

For production, set the public canonical URL in `.env`, then combine the base file with the production override:

```dotenv
WEB_PUBLIC_URL=https://app.example.com
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production override forces `NODE_ENV=production`, removes every host mapping for PostgreSQL, Redis, MinIO (including the console), and the API, and binds only the web runtime to `127.0.0.1:${WEB_PORT}`. Configure the VPS reverse proxy to terminate TLS and forward the public virtual host to that loopback address. It must preserve the original `Host` header and set `X-Forwarded-Proto: https`; include the normal `X-Forwarded-For` header as well.

Do not forward MinIO or its console through the reverse proxy. The application bucket is private: listing media is read through the same-origin `/media-files/...` API route after session and listing-owner authorization. This is intentional; an opaque object key is not an access-control mechanism.

### Passwords and sessions

New passwords must be unique passphrases with at least 15 characters. They are stored as versioned PBKDF2-HMAC-SHA512 hashes with 220,000 iterations and a random 16-byte salt. Existing legacy 100,000-iteration hashes are upgraded automatically after the next successful login.

The application checks new passwords through the HIBP Pwned Passwords k-anonymity range API. It sends only the first five characters of a locally calculated SHA-1 hash, never the password or its full hash. The check is enabled and fail-closed by default; use the documented `PASSWORD_BREACH_CHECK_*` environment variables only when an operational exception is necessary.

Each login receives a database-backed session ID embedded in the HttpOnly JWT cookie. The account panel shows active sessions and can end one or all other sessions. A password reset revokes every previous session before the user can log in again.

### Resource limits and audit trail

The active API applies per-user limits to listing count, server-recorded media storage, upload frequency, active publication jobs, and publication frequency. Listing and storage quotas are checked while holding a per-user PostgreSQL transaction lock, so concurrent requests cannot bypass them. The worker has independently configurable concurrency and publication throughput limits.

Security-relevant successful actions are written to `AuditLog`: account registration/activation, login, password-reset lifecycle, listing status changes, media uploads, marketplace-account linking/unlinking, and publication status changes. Metadata is allowlisted and strips password, token, secret, cookie, credential, and reset-code fields.

### Email rendering

Transactional emails intentionally use an opaque, light color palette with explicit HTML `bgcolor` attributes and `color-scheme: light` metadata. This avoids the partial color inversion that can render dark-gradient email templates unreadable in clients using automatic dark mode.

### 5. Install Dependencies

```powershell
# Install all workspace dependencies
pnpm install
```

### 6. Set Up the Database

```powershell
# Navigate to the API workspace
cd apps/api

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed the database with initial data
# npx prisma db seed

# Return to project root
cd ..\..
```

### 7. Start the Applications

Open three separate PowerShell terminals from the project root:

**Terminal 1 — API server:**
```powershell
pnpm --filter @multiportal/api dev
```

**Terminal 2 — Worker:**
```powershell
pnpm --filter @multiportal/worker dev
```

**Terminal 3 — Web frontend:**
```powershell
pnpm --filter @multiportal/web dev
```

Or start all three in parallel (single terminal):

```powershell
pnpm dev
```

### 8. Access the Application

- **Web frontend:** http://localhost:3000
- **API server:** http://localhost:3001
- **MinIO Console:** http://localhost:9001 (login: `minioadmin` / `minioadmin`)

### 9. Run Tests

```powershell
# Run all tests across the workspace
pnpm test

# Run tests for a specific package
pnpm --filter @multiportal/api test
pnpm --filter @multiportal/web test
pnpm --filter @multiportal/worker test

# Run E2E tests
npx playwright test
```

### Troubleshooting

**"pnpm is not recognized":** Run `npm install -g pnpm` and restart the terminal.

**Docker containers fail to start:** Ensure Docker Desktop is running and WSL 2 is installed (`wsl --install` as Administrator).

**Port conflicts:** Edit `.env` and change `API_PORT`, `WEB_PORT`, or the Docker Compose port mappings.

**Database connection errors:** Check that `docker compose up -d` completed successfully and `DATABASE_URL` in `.env` matches the Docker Compose credentials.

## Repository Structure

```text
apps/
  web/
  api/
  worker/

packages/
  shared/
  connectors/
  config/

memory-bank/
  projectbrief.md
  productContext.md
  activeContext.md
  systemPatterns.md
  techContext.md
  progress.md

.clinerules/
  01-project.md
  02-coding-style.md
  03-workflow.md
  04-memory-bank.md
  05-language-and-output.md

README.md
AGENTS.md
.env.example
docker-compose.yml
```

## Core Backend Modules

- AuthModule
- UsersModule
- WorkspacesModule
- ListingsModule
- MediaModule
- MarketplaceAccountsModule
- MarketplaceConnectorsModule
- PublicationJobsModule
- WebhooksModule
- AuditLogModule
- ConfigModule

## Core Domain Entities

- User
- Workspace
- ListingDraft
- ListingMedia
- MarketplaceProvider
- MarketplaceAccount
- ExternalListing
- PublicationJob
- PublicationEvent
- CategoryMapping
- AttributeMapping
- AuditLog

## Connector Architecture

Marketplace integrations must use a provider-agnostic connector interface.

Each provider should implement the same contract and expose its capabilities.

Example capabilities:

- supports listing creation
- supports listing update
- supports listing deletion
- supports status synchronization
- supports webhooks
- supports delivery options
- requires partner access
- requires pro account
- maximum photo count
- maximum description length
- category mapping requirements
- attribute mapping requirements

Provider-specific logic must stay inside the connector layer.

Application code should not directly depend on OLX, Vinted, Facebook Marketplace or any other provider-specific implementation.

## Configuration Rules

Never hardcode:

- secrets
- API keys
- API base URLs
- ports
- database URLs
- Redis URLs
- storage bucket names
- local file paths
- provider IDs
- credentials
- OAuth configuration
- feature flags

Use environment variables and validate them at startup.

The application must fail fast when required configuration is missing.

All secrets must be excluded from git.

## Security Requirements

- Do not store provider tokens in plain text.
- Encrypt external provider credentials and tokens at rest.
- Never log secrets, access tokens, refresh tokens, cookies, authorization headers or signing keys.
- Use secure authentication.
- Use rate limiting on authentication and publication endpoints.
- Use audit logs for important user and integration actions.
- Use idempotency keys for publishing operations to prevent duplicate external listings.
- Token fields in the database must support long token values.

## Listing Publication Flow

Expected flow:

1. User creates or edits a listing draft.
2. User uploads listing media.
3. User selects one or more target marketplace providers.
4. Backend validates draft completeness.
5. Backend validates selected provider capabilities.
6. Backend creates publication jobs.
7. Worker processes publication jobs.
8. Connector maps internal draft data to provider payload.
9. Connector publishes the listing through the provider API.
10. System stores external listing ID and status.
11. User sees status per marketplace.

## Publication Statuses

### Listing Draft Status

- draft
- ready
- archived

### External Listing Status

- queued
- publishing
- published
- failed
- requires_action
- expired
- sold
- deleted
- unsupported

### Publication Job Status

- pending
- processing
- success
- failed
- retrying
- cancelled

## Development Rules

Before implementing code:

1. Read README.md.
2. Read AGENTS.md if it exists.
3. Read all files in `.clinerules/`.
4. Read all files in `memory-bank/`.
5. Update Memory Bank if it is missing or outdated.
6. Create a short implementation plan.
7. Implement the smallest safe step.
8. Run relevant tests when possible.
9. Update Memory Bank after meaningful changes.

## Testing Rules

Critical business logic must have tests.

Required test areas:

- configuration validation
- connector interface behavior
- provider capability checks
- listing draft validation
- publication job creation
- idempotency handling
- token encryption/decryption logic
- API authorization rules

End-to-end tests should cover:

- user signup or login
- listing draft creation
- media upload
- provider selection
- publication job creation
- publication status display

If tests cannot be run, document the reason in `memory-bank/progress.md`.

## Version Policy

Before adding, pinning or documenting dependency versions, runtime versions, Docker images or framework versions:

- Verify the latest stable or latest LTS version from official sources.
- Prefer latest LTS for runtimes such as Node.js.
- Prefer latest stable versions for frameworks and libraries unless compatibility issues are documented.
- Do not use outdated baseline versions without a clear reason.
- Do not guess versions.
- Do not use `latest` Docker tags blindly for production-oriented configuration.
- Document important version decisions in `memory-bank/techContext.md`.
- If the exact current version cannot be verified, stop and ask instead of guessing.

## Current Development Phase

This project starts from scratch.

Initial priorities:

1. Create repository structure.
2. Configure monorepo.
3. Add Docker Compose for PostgreSQL, Redis and MinIO.
4. Add shared configuration validation.
5. Add initial Prisma schema.
6. Add backend application shell.
7. Add frontend application shell.
8. Add listing draft flow.
9. Add mock marketplace connector.
10. Research official provider APIs before implementing real marketplace integrations.
