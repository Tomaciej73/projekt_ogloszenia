# Product Context

## Problem Statement
Sellers who operate across multiple marketplace platforms (OLX, Vinted, Facebook Marketplace, etc.) must manually create and manage listings on each platform separately. This leads to:
- Duplicate data entry for the same listing
- Inconsistent listing information across platforms
- Difficulty tracking publication status per platform
- Time-consuming manual updates, unpublishing, and relisting
- No centralized view of listing performance

## Solution
MultiPortal Listing Manager provides a single interface to create a listing draft once and publish it to multiple marketplaces simultaneously. Users connect their marketplace accounts, create rich listing drafts with media, and publish to selected platforms with one action. The system tracks publication status per platform and supports the full listing lifecycle.

## Target Users
- Individual sellers managing listings on 2+ platforms
- Small businesses with multi-channel sales strategies
- Resellers who cross-post inventory across marketplaces
- Future: agencies managing listings for multiple clients (workspace support)

## Core User Flows

### 1. Account Setup
1. User signs up / logs in
2. User creates or joins a workspace
3. User navigates to "Connected Accounts"
4. User connects a marketplace account (OAuth or API key, depending on provider)
5. System stores encrypted credentials/tokens
6. User repeats for additional marketplaces

### 2. Listing Creation & Publication
1. User opens "Create Listing" form
2. User fills in: title, description, price, category, attributes, photos, location, delivery options
3. Form validates completeness and provider-specific constraints (photo count, description length, etc.)
4. At the bottom, user sees connected marketplace providers with capability indicators
5. User selects target platforms
6. User clicks "Publish to selected platforms"
7. System creates publication jobs with idempotency keys
8. Background worker processes each job through the appropriate connector
9. Connector maps internal draft data to provider-specific format
10. Connector publishes listing via provider API
11. System stores external listing ID and initial status
12. User sees publication status dashboard update in real-time or on refresh

### 3. Listing Management
1. User views listing dashboard with status per platform
2. User can update listing draft and republish to selected platforms
3. User can unpublish from specific platforms
4. User can relist previously unpublished listings
5. User can sync status from external platform (where supported)
6. User can archive listing drafts no longer needed

### 4. Error Handling
- Failed publication jobs show detailed error messages
- Retry mechanism with exponential backoff for transient failures
- `requires_action` status for listings needing manual intervention
- Audit log captures all publication events for troubleshooting

## Provider Integration Statuses (UX Impact)

| Status | UX Treatment |
|--------|-------------|
| `official_api` | Full integration, publish/update/delete/sync |
| `partner_api_required` | Shown as "requires partnership" with info link |
| `pro_account_required` | Shown as "requires pro account" with upgrade link |
| `manual_export_only` | Shown as "manual export only" with export instructions |
| `unsupported` | Hidden from provider selection or shown as unavailable |
| `research_required` | Shown as "coming soon" or hidden until researched |

## Key UX Principles
- Listing form should feel familiar (similar to marketplace native forms)
- Provider capabilities should be transparent before user selects a platform
- Publication status should be clear and timely
- Errors should be actionable with clear next steps
- No silent failures — every publication attempt must produce a visible outcome
- Provider-specific limitations (max photos, max description length) should be enforced in the form