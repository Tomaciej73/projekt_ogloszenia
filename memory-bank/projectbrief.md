# Project Brief

## Project Name
**MultiPortal Listing Manager**

## Core Goal
Build a web application that allows users to create listing drafts once and publish/manage them across multiple marketplace platforms (OLX, Vinted Pro, Facebook Marketplace, and future providers) from a single centralized interface.

## Project Scope

### In Scope
- User account creation and authentication
- Multi-tenant workspace support
- Listing draft creation with title, description, price, category, attributes, photos, location, and delivery options
- Media upload and management (S3-compatible storage)
- Marketplace provider account linking
- Provider-agnostic connector architecture with capability declarations
- Publication job creation with idempotency keys
- Background worker processing for publishing, status sync, and retries
- Publication status tracking per marketplace
- Audit logging for account linking, publishing, updating, and deleting external listings
- Listing lifecycle management: create, update, unpublish, relist, sync status

### Out of Scope (Unless Explicitly Approved)
- Browser automation, scraping, private APIs, cookie hijacking, or UI automation
- Provider integrations without documented official API or partner API access
- Manual-only marketplace exports (initially)

### Future Scope
- Additional marketplace providers beyond OLX, Vinted Pro, and Facebook Marketplace
- Automated category/attribute mapping with AI
- Bulk operations across multiple listings
- Analytics dashboard for listing performance
- Mobile application

## Key Constraints
1. **Official API first** — All marketplace integrations must use official or documented partner APIs by default.
2. **Provider-agnostic architecture** — Application code must not depend on provider-specific implementations.
3. **No hardcoded configuration** — All configuration via environment variables, validated at startup.
4. **Security first** — Provider tokens encrypted at rest, no secrets in logs, HttpOnly auth, CSRF protection, rate limiting.
5. **Idempotency** — Publication operations must use idempotency keys to prevent duplicate listings.

## Provider Integration Status Taxonomy
Every marketplace integration must carry one of these documented statuses:
- `official_api` — Public, documented API available for normal user accounts
- `partner_api_required` — API requires partnership agreement
- `pro_account_required` — Requires business/pro account
- `manual_export_only` — No API; manual export is the only option
- `unsupported` — No viable integration path identified
- `research_required` — Not yet researched; status unknown

## Provider Roadmap (Priority Order)
1. **OLX** — `research_required`, first priority
2. **Vinted Pro** — `research_required`, second priority
3. **Facebook Marketplace** — `research_required`, third priority
4. **Other providers** — future scope

No real provider integration shall be implemented until official API access, limitations, and requirements are documented.