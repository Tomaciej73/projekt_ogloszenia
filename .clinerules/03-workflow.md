# Workflow

Before coding:
1. Inspect relevant files.
2. Check Memory Bank.
3. Create a short plan.
4. Identify affected modules.
5. Implement minimal changes.
6. Run relevant tests if possible.
7. Update Memory Bank.

For larger changes:
- Start with architecture/design notes.
- Do not rewrite unrelated files.
- Do not introduce dependencies without explaining why.
- Prefer incremental implementation over big-bang rewrites.
- If a provider API is unclear, research and document the uncertainty before implementing.

## Version Verification

Before adding, pinning or documenting dependency versions, runtime versions, Docker images or framework versions:

- Verify the latest stable or latest LTS version from official sources.
- Prefer latest LTS for runtimes such as Node.js.
- Prefer latest stable versions for frameworks and libraries unless compatibility issues are documented.
- Do not use outdated baseline versions without a clear reason.
- Do not guess versions.
- Do not use `latest` Docker tags blindly for production-oriented configuration.
- Document important version decisions in `memory-bank/techContext.md`.