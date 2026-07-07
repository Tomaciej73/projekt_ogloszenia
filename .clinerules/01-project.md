# Project Rules

This project is a multichannel listing management platform.

Users create listing drafts once and publish/manage them across multiple marketplace platforms such as OLX, Vinted Pro, Facebook Marketplace and future providers, depending on available official or partner APIs.

## Core rules

- Read README.md, AGENTS.md, .clinerules/* and memory-bank/* before implementation.
- Do not hardcode configuration values.
- Do not hardcode absolute file paths.
- Do not store secrets in code.
- Do not log secrets, tokens, cookies, credentials or authorization headers.
- Use environment variables validated at startup.
- Keep changes small and incremental.
- Prefer provider-agnostic architecture over provider-specific shortcuts.
- Use official APIs first.
- Do not use scraping, private APIs, browser automation or cookie-based automation unless explicitly approved and documented as a risk.
- Update Memory Bank after meaningful changes.

## Language Policy

The project owner may provide instructions in Polish, but all repository content must be created and maintained in English. See `.clinerules/05-language-and-output.md`.