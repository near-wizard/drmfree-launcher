# 0008 — DRM-status data source for the upgrade-prompt feature

**Status:** decided (approach), not yet built — this is Stage 2a scope

Decision 0006's "buy DRM-free version" prompt needs to know, for a
locally-detected DRM-locked game (e.g. a Steam title), whether a
DRM-free equivalent exists. There's no storefront API that exposes
this as a field (see the earlier discussion in this decision log's
adjacent conversation) — this decision is about where that data comes
from.

## PCGamingWiki checked and ruled out as a direct source

PCGamingWiki maintains the most comprehensive "List of DRM-free games"
available, but its content is licensed **CC BY-NC-SA 3.0** (confirmed
directly via `pcgamingwiki.com/w/api.php?action=query&meta=siteinfo`,
not secondhand). The NonCommercial clause blocks using their compiled
list to power this feature regardless of whether our own derived
output is open-sourced — NC restricts the *use of their material*
toward commercial advantage, and this feature exists to drive
affiliate/publisher revenue. Publishing our own list openly solves a
ShareAlike concern, not the NC one.

## The path forward: build, don't scrape

Facts ("this game ships without DRM") aren't copyrightable — only
PCGamingWiki's specific compiled expression of that fact (their
article's selection/wording/arrangement) is protected. So:

- Do not scrape or bulk-import PCGamingWiki's list, even into an open
  dataset.
- Do build an independently-compiled, open (MIT or CC0), community
  -editable dataset, verified against primary sources (the storefront
  listing itself, publisher statements) — using PCGamingWiki only the
  way any contributor would use any wiki to fact-check, not as a bulk
  data source.

## Why this isn't being built now

Nothing in Stage 0/1 needs this. Scaffolding it now is ahead of
Stage 2a's actual GOG-catalog/title-matching work per the brief's own
sequencing rule. Revisit when Stage 2a's catalog and title-matching
design (see decision 0006's open questions) is actually underway.

## Update: provenance schema exists, dataset still doesn't

`Game.drm` (`src-tauri/src/providers/mod.rs`) is a `DrmRecord {
status, source, method }`, not a bare status — `method` is a
`DrmDeterminationMethod` (`gog_import`, `publisher_declared`,
`community_review`, `manual_review`, ...) so a future record can say
*how* its status was determined, not just what it is. Today only
`gog_import` is ever constructed (GOG's whole-storefront policy, in
`gog.rs`); the other variants exist so this dataset — whenever it's
built — has somewhere to plug in without a breaking type change.
This is the record shape, not the sourcing work above; that's still
not started.
