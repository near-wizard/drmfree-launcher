# Roadmap

Public-facing snapshot of what stage this project is in and what's next.
See `decisions/` for the reasoning behind major calls.

## Stage 0 — Launcher MVP (in progress)
Prove the tech: local detection + native launch handoff for installed
games, unified into one library UI. Fully open source, zero
monetization, zero accounts.

- [x] `GameProvider` abstraction
- [x] Steam provider (detect + `steam://rungameid/` launch)
- [x] GOG provider (detect + direct exe launch) — Windows via registry;
      Linux via Heroic Games Launcher's own data (best-effort, unverified
      against a real installed.json — see `providers/gog.rs`); macOS
      not yet supported.
- [x] Unified library UI shell
- [x] Packaged builds — Windows (MSI/NSIS), Linux, and macOS all ship
      via `.github/workflows/release.yml` (first tag: v0.1.0). A CI-only
      Linux clippy failure (Windows-only GOG code left dead items on
      other platforms — see `src-tauri/src/providers/gog.rs`) briefly
      looked macOS-specific before the real cause was found; fixed for
      all three platforms.
- [x] Epic provider (detect via `.item` manifests + `com.epicgames.launcher://`
      launch) — Epic is still a DRM-locked storefront (see
      `decisions/0005-drm-free-only-catalog.md`), but broader library
      aggregation directly serves the "wean off DRM" loop (decision
      0006): can't prompt an upgrade for a DRM game you never detected.

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

## Stage 2a — DRM-Free Affiliate Storefront (in progress)
A curated discovery/link-out layer on top of existing **DRM-free**
storefronts only (starting with GOG's affiliate program) — real
revenue and a demand signal, before any direct publisher deals. No
fulfillment role, no in-app checkout. Storefront/title eligibility is
gated on DRM-free status, not just "pays an affiliate commission" —
see `decisions/0005-drm-free-only-catalog.md`.

- [x] In-app Store tab browsing GOG's public catalog (search,
      trending, pagination), with a clearly labeled "Buy on GOG"
      link-out — no payment/fulfillment in the app.
- [x] itch.io evaluated as the next storefront — not added: no real
      commission-based affiliate program exists yet, and there's no
      verified (non-self-reported) per-title DRM-free signal in its
      API. See `decisions/0010-itchio-evaluation.md`. Revisit if
      either changes.
- [ ] "Buy DRM-free version" upgrade prompt on detected DRM-locked
      titles (the core loop below) — not started.

Core loop this unlocks: keep launching your existing (often
DRM-locked) library, but surface a "Buy DRM-free version" prompt on
detected titles that have a DRM-free equivalent in our catalog —
preferring a direct publisher deal over an affiliate listing when
both exist. See `decisions/0006-drm-free-upgrade-path.md`. Depends on
a title-matching mechanism between locally-detected games and catalog
entries, which doesn't exist yet, and a DRM-status data source for
non-GOG titles — see `decisions/0008-drm-status-data-source.md`
(PCGamingWiki's list is CC BY-NC-SA and ruled out for this use; the
plan is an independently-compiled open dataset, not yet started).

## Stage 2b — Direct Publisher Deals (future)
Separate, closed-source marketplace backend once Stage 2a validates
demand. Indie-publisher-first, self-serve, published take-rate. See
`decisions/0011-open-core-boundary-concrete-split.md` for exactly
which pieces of Stage 2a stay open vs. move to this closed backend —
notably affiliate tag injection, which doesn't exist yet either
(today's "Buy on GOG" links are plain, untagged URLs).

## Stage 3+ — Differentiation (future)
Curated discoverability, published moderation policy, Linux/handheld
platform focus.
