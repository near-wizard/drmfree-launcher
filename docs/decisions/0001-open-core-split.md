# 0001 — Open-core split

**Status:** decided

The launcher/client is open source. The marketplace backend,
payments, and publisher tooling stay closed/hosted. These two halves
are never blended in code or UX — the marketplace (Stage 2+) is a
separate service, cleanly decoupled from the launcher's codebase.
