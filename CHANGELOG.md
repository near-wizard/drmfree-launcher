# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
User-facing changes only — see `git log` for implementation history.

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
