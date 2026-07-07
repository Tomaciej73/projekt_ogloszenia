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

# Editor and Session Hygiene

- Keep editor clutter low.
- Do not open unrelated files.
- After editing, mention which files were modified.
- After each task, summarize whether any terminals, dev servers, watchers or long-running processes were started.
- Do not leave long-running commands active unless explicitly required.
- Before starting a new implementation phase, check whether previous terminals or dev servers are still running.
- If a terminal process is no longer needed, ask for approval to stop it.
- Prefer short-lived commands for validation.
- Do not start multiple dev servers, watchers or package install processes in parallel.

Before starting this phase:
1. Do not start multiple long-running commands.
2. If you need to start a dev server or watcher, clearly say so.
3. After finishing, report any running terminals/processes that should be stopped.
4. Keep opened files to the minimum necessary.
5. Do not open unrelated files.
6. Update memory-bank after meaningful changes.