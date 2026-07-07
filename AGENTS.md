# AGENTS.md — AI Assistant Guidance

This file provides instructions for AI assistants (Cline, Copilot, etc.) working on the MultiPortal Listing Manager project.

## Project Context

MultiPortal Listing Manager is a multichannel listing management platform. Users create listing drafts once and publish/manage them across multiple marketplace platforms (OLX, Vinted Pro, Facebook Marketplace, and future providers) depending on available official or partner APIs.

## Before Any Task

1. Read `README.md`.
2. Read all files in `.clinerules/`.
3. Read all files in `memory-bank/`.
4. If `memory-bank/productContext.md` does not exist, create it.
5. If any `memory-bank/` file is incomplete or outdated, update it before implementation.
6. Work in planning mode for architectural changes.
7. Ask clarification questions only when a decision blocks implementation.

## Core Rules

- Read `.clinerules/` before implementation — those files contain the authoritative project rules.
- Do not hardcode configuration values, absolute file paths, or secrets.
- Use environment variables validated at startup.
- Prefer provider-agnostic architecture over provider-specific shortcuts.
- Use official APIs first. Do not use scraping, private APIs, browser automation or cookie-based automation unless explicitly approved and documented as a risk.
- Keep changes small and incremental.
- Update Memory Bank after meaningful changes.

## Language

The project owner may write prompts in Polish. All repository files, source code, comments, documentation, README, AGENTS.md and Memory Bank files must be written and updated in English. See `.clinerules/05-language-and-output.md`.

## Version Policy

Before adding or pinning dependency versions:
- Verify the latest stable or latest LTS version from official sources.
- Prefer latest LTS for runtimes (Node.js).
- Prefer latest stable for frameworks and libraries.
- Do not guess versions. If the exact version cannot be verified, stop and ask.
- Document version decisions in `memory-bank/techContext.md`.

## Repository Structure

```
apps/
  web/          — Next.js frontend
  api/          — NestJS REST API
  worker/       — NestJS background worker (BullMQ)
packages/
  shared/       — Shared DTOs, types, enums, validation schemas
  connectors/   — Connector interface + provider implementations
  config/       — Environment configuration validation (Zod)
memory-bank/    — Project documentation (always keep current)
.clinerules/    — Project rules (authoritative)
```

## Provider Integration Rules

- Every marketplace connector must implement the shared `MarketplaceConnector` interface from `packages/connectors`.
- Each provider must declare its integration status: `official_api`, `partner_api_required`, `pro_account_required`, `manual_export_only`, `unsupported`, or `research_required`.
- All providers currently have `research_required` status. Do not implement real marketplace integrations until official API documentation has been reviewed and the integration status has been updated.
- Do not assume every marketplace has a public API for normal user accounts.

## Publication Flow

1. User creates listing draft → 2. Selects target platforms → 3. System creates publication jobs with idempotency keys → 4. Worker processes jobs through provider connectors → 5. External listing status stored → 6. User sees status per platform.

## Status Enums

See `README.md` for the full listing of `ListingDraftStatus`, `ExternalListingStatus`, and `PublicationJobStatus` values.

## Local Development Setup

Before working on this project, verify the following are installed (run in PowerShell):

```powershell
node --version    # Expected: v24.x.x LTS
pnpm --version    # Expected: 11.x.x
git --version     # Expected: git version 2.x.x
docker --version  # Expected: Docker version 29.x.x
docker compose version  # Expected: Docker Compose version v5.x.x
```

If pnpm is missing, install it:

```powershell
npm install -g pnpm
```

Quick start after cloning:

```powershell
copy .env.example .env
docker compose up -d
pnpm install
cd apps/api && npx prisma generate && npx prisma migrate dev && cd ..\..
pnpm dev
```

Access:
- http://localhost:3000 — Web frontend
- http://localhost:3001 — API server
- http://localhost:9001 — MinIO Console (minioadmin / minioadmin)

## Security

- Do not store provider tokens in plain text (AES-256-GCM encryption at rest).
- Never log secrets, tokens, cookies, credentials or authorization headers.
- Use HttpOnly secure cookies or another secure server-side auth strategy.
- Use CSRF protection and rate limiting on auth and publication endpoints.
- Use audit logs for account linking, publishing, updating and deleting external listings.
- Token fields in the database must use `text` type (not `varchar(255)`).