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
- Never hardcode credentials, passwords, API keys, tokens, URLs with embedded credentials, or connection strings in any source file (TypeScript, JavaScript, HTML, CSS, JSON configs, docker-compose.yml, Dockerfile). All such values must come from environment variables (`.env` file). Even test/dev values must not appear in source code.
- Never use `${VAR:-fallback_secret}` or `${VAR:-placeholder_value}` syntax for secrets, passwords, tokens, or keys in docker-compose.yml or any configuration file. If a secret is required, the variable must be set explicitly in `.env` — no defaults, no fallbacks, no placeholders for sensitive values.
- Keep changes small and incremental.
- Prefer provider-agnostic architecture over provider-specific shortcuts.
- Use official APIs first.
- Do not use scraping, private APIs, browser automation or cookie-based automation unless explicitly approved and documented as a risk.
- Update Memory Bank after meaningful changes.
- Never revert or undo changes made by the project owner (user). If the owner modifies port numbers, configuration values, file names, or any other project settings, accept those changes as authoritative and work with them. Do not "fix" or "correct" the owner's edits unless explicitly asked.

## Language Policy

The project owner may provide instructions in Polish, but all repository content must be created and maintained in English. See `.clinerules/05-language-and-output.md`.