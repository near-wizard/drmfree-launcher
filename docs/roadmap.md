# Roadmap

Public-facing snapshot of what stage this project is in and what's next.
See `decisions/` for the reasoning behind major calls.

## Stage 0 — Launcher MVP (in progress)
Prove the tech: local detection + native launch handoff for installed
games, unified into one library UI. Fully open source, zero
monetization, zero accounts.

- [x] `GameProvider` abstraction
- [x] Steam provider (detect + `steam://rungameid/` launch)
- [x] GOG provider (detect + direct exe launch)
- [x] Unified library UI shell
- [x] Packaged builds (Windows verified locally: MSI + NSIS installer
      build clean; Linux/macOS build via `.github/workflows/release.yml`
      on GitHub Actions, not yet run since there's no pushed remote yet)
- Epic provider: deprioritized — Epic is a DRM-locked storefront,
  off-thesis for a DRM-free-focused product (see
  `decisions/0005-drm-free-only-catalog.md`). Revisit only if
  aggregation breadth becomes a real user ask.

## Stage 1 — Community & Governance (in progress)
Publish as open source with a public handbook: this roadmap, a
decision log, and contribution guidelines.

- [x] Repo public on GitHub (near-wizard/drmfree-launcher)
- [x] License decided and applied — MIT (`decisions/0004-license.md`)
- [x] Project name finalized — DRM-Free Launcher (`decisions/0007`)
- [x] Roadmap + decision log (this directory)
- [x] Contribution guidelines — open to external PRs
      (`docs/CONTRIBUTING.md`)
- [x] Code of conduct (`docs/CODE_OF_CONDUCT.md`)

## Stage 2a — DRM-Free Affiliate Storefront (planned, not started)
A curated discovery/link-out layer on top of existing **DRM-free**
storefronts only (starting with GOG's affiliate program) — real
revenue and a demand signal, before any direct publisher deals. No
fulfillment role, no in-app checkout. Storefront/title eligibility is
gated on DRM-free status, not just "pays an affiliate commission" —
see `decisions/0005-drm-free-only-catalog.md`.

Core loop this unlocks: keep launching your existing (often
DRM-locked) library, but surface a "Buy DRM-free version" prompt on
detected titles that have a DRM-free equivalent in our catalog —
preferring a direct publisher deal over an affiliate listing when
both exist. See `decisions/0006-drm-free-upgrade-path.md`. Depends on
a title-matching mechanism between locally-detected games and catalog
entries, which doesn't exist yet.

## Stage 2b — Direct Publisher Deals (future)
Separate, closed-source marketplace backend once Stage 2a validates
demand. Indie-publisher-first, self-serve, published take-rate.

## Stage 3+ — Differentiation (future)
Curated discoverability, published moderation policy, Linux/handheld
platform focus.
