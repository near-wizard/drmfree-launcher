# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
User-facing changes only — see `git log` for implementation history.

## [Unreleased]

Everything below has shipped to `master` since the v0.1.0 tag but
hasn't gone out under a version number yet — see `HUMAN_TODO.md` at
the repo root's parent directory for why (no release currently drops
`prerelease: true`). Kept up to date as work lands so cutting the next
real release is a rename, not a research project.

### Added

- **Humble Bundle provider** — detects and launches installed titles
  via the Humble App's own `config.json` (Windows only for now).
  Humble's full catalog (outside the Choice/Trove subscription tiers)
  is DRM-free by storefront policy, same as GOG. See `decisions/0020`.
- **Library "freedom" dashboard** — "N of M games are DRM-free,"
  updating live as you check titles against GOG's catalog.
- **"Compare the deal" view** — a side-by-side of a locked platform's
  terms vs. GOG's for a specific detected game, with real prices
  (a keyless Steam price lookup feeds the comparison).
- **Steam wishlist cross-reference** — reads a public Steam wishlist
  and flags which titles already have a DRM-free option on GOG today
  (keyless lookup, no Steam account linking).
- **Manual "I own this DRM-free" entries** — record ownership for
  storefronts without a provider yet (itch.io included).
- **Multiplayer-needs-platform flag** — an otherwise-DRM-free title
  can be flagged if its multiplayer still depends on the original
  platform's servers, so the DRM-free badge doesn't overclaim.
- **Community DRM-status reporting** (backend built; only renders once
  `drmfree-community` is deployed and `COMMUNITY_API_URL` is set — see
  `HUMAN_TODO.md`) — community-submitted DRM-status reports feed a
  consensus signal into a title's badge when no other determination
  exists. See `decisions/0014` and `decisions/0016`.
- Content-Security-Policy hardening (previously unset).
- macOS GOG detection via Heroic Games Launcher, matching the existing
  Linux path — GOG detection now covers all three OSes.
- React error boundary so a render crash doesn't blank the whole app.
- "Open install folder" action on library game cards.
- Test coverage for the Tauri command surface and the Store view.

### Fixed

- Duplicate games no longer appear from Steam library-folder
  detection.
- Epic provider no longer lists non-launchable DLC manifests as
  top-level games.

## [0.1.0] - 2026-09-03

First tagged release: Stage 0 launcher MVP + Stage 2a Store tab.

### Added

- **Unified library** — detects and launches installed games from
  Steam, GOG (Windows via registry, Linux via Heroic Games Launcher),
  and Epic. No accounts, no ownership APIs — local install data only.
- **Search, filter, and sort** your library by source, DRM status, or
  name/source/recently-played.
- **DRM status tracking** with source and determination method shown
  on each game's badge (hover for details).
- **Store tab** — browse and search GOG's DRM-free catalog directly,
  with an NSFW filter (off by default). Purchases happen on gog.com;
  this app never handles payment or fulfillment.
- **"Buy DRM-free version"** — check any installed game against GOG's
  catalog for a DRM-free equivalent (exact-title match, not a fuzzy
  guess), individually per game or for your whole library in one pass.
  Results persist across restarts.
- **Cover art** for Steam and GOG titles.
- **"Request a change"** — opens a pre-filled GitHub issue with your
  app version already attached.
- Lightweight update-available check on launch (compares against the
  latest GitHub release; no auto-updater yet).

### Platform support

Windows, Linux, and macOS builds.
