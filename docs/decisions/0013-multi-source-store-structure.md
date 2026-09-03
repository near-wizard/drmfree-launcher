# 0013 — Store tab supports multiple sources (structure only)

**Status:** decided

## Decision

The Store tab's backend is refactored from "a GOG-specific module" into a
`StoreSource` trait (`src-tauri/src/store/mod.rs`), mirroring how
`providers::GameProvider` already abstracts local-library detection across
Steam/GOG/Epic. GOG (`store/gog.rs`) is the only real implementation today.
This is a structural change only — no itch.io, Steam-DRM-free, or
first-party-deals source is implemented yet, and none of them are
committed to a timeline by this decision.

## Shape

- `StoreSource` — `id()`, `display_name()`, and an async `search()` that
  returns a `StoreSearchResult` in the source's own normalized shape.
- `all_store_sources()` — the single registration point; adding a source
  is "implement the trait, add one line here."
- `search_store` (Tauri command) — takes an optional `source` id. Omitted
  means "query every registered source and merge." A single source's
  failure doesn't blank the whole tab as long as at least one other
  source succeeded; `total_pages` for a merged search is the max across
  sources (an approximation — sources don't share a page size, so this
  isn't an exact combined count. Fine while one source is active;
  revisit if/when "Load more" needs to be precise with several active at
  once).
- `list_store_sources` (new Tauri command) — lets the frontend build a
  source filter without hardcoding source ids. `StoreView` already calls
  it and renders a filter `<select>`, but hides it while only one source
  is registered (a one-option dropdown is noise, not a feature).
- `StoreListing.store` is a human-readable label (`"GOG"`), not a
  matching key — the `source` filter param matches on `StoreSource::id()`
  instead, so display text can change independently of the identifier.

## Why now

The user asked directly for the store to support multiple sources (GOG,
itch.io, curated DRM-free Steam titles, potential first-party deals) and
for "just the structure" — i.e., make adding a source cheap later without
building any of those sources now. Doing the refactor while there's only
one real source is also the easiest time to do it: there's no existing
multi-source behavior to preserve or migrate.

## What's explicitly not in scope here

- itch.io integration, a curated DRM-free Steam list, or first-party deal
  listings — none of these are built; this only makes them pluggable.
- Per-source affiliate/tag handling — still governed by decision 0011
  (affiliate tag injection is a private-backend concern, not something
  any `StoreSource` implementation should do directly).
- Exact cross-source pagination — flagged above as an approximation,
  intentionally deferred.
