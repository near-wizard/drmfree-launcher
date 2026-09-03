# 0020 — Humble Bundle provider, and a generic StorefrontImport method

**Status:** implemented (Windows only)

`PRODUCT_IDEAS.md` (outside any git repo) named Humble Bundle as an
A-tier addition: its own catalog (not the Humble Choice/Trove
subscription) is sold DRM-free by storefront-wide policy, same as
GOG — a real new provider reinforces the thesis by surfacing a
storefront that's already aligned with it, not fighting it.

## Research before building

No official Humble documentation covers the local install format, so
before writing any Rust, a research pass confirmed the real schema
against a maintained, actively-updated open-source detector's actual
source (`Nutzzz/GLC`, `Platforms/Humble.cs` — fetched and read
directly, not paraphrased from a summary):

- **Windows config**: `%APPDATA%\Humble App\config.json`, plain JSON
  (not SQLite).
- **Schema**: a `user` object (`owns_active_content`, `is_paused`) and
  a version-suffixed `game-collection-4` array (the suffix itself
  implies this key has changed across Humble App versions before —
  handled by defaulting to empty rather than erroring if a future
  version renames it again).
- Per-entry fields: `isAvailable`, `machineName`, `status`, `gameName`,
  `downloadMachineName`, `gamekey`, `executablePath` (relative — must
  be joined onto `filePath`, not used alone), `filePath`.
- **Real gotcha**: `machineName` entries suffixed `_collection` are
  Humble Choice subscription games — their `status` can still say
  `"installed"` after the subscription itself has lapsed or is paused,
  so detection additionally gates those on
  `user.owns_active_content && !user.is_paused`, or they'd show as
  playable ghosts.
- **Launch**: Humble does have its own `humble://launch/<id>` protocol
  handler (registered under `HKCR\humble\shell\open\command`), but
  `config.json` already gives a direct exe path — same "run the
  executable directly" model this project already uses for GOG, no
  protocol-handoff complexity needed.
- **macOS/Linux**: not covered. GLC's own detection is Windows-only
  (`[SupportedOSPlatform("windows")]`) — the most complete open
  reverse-engineering effort available not bothering with other
  platforms is itself a signal, not just an oversight on this
  project's part. `providers/humble.rs` returns an empty list on any
  non-Windows target rather than guessing a path, same caution
  `gog.rs` already documents for its own less-certain paths.

## StorefrontImport rename

Adding a second DRM-free-by-policy storefront exposed that
`DrmDeterminationMethod::GogImport` (decision 0008) was named after
its first and only user, not what it actually represents. Since
`DrmRecord` is never persisted to disk (recomputed fresh every scan,
sent over Tauri IPC only for the current session), renaming it to
`StorefrontImport` (wire value `storefront_import`) was a safe,
contained change — no stored-data migration needed. `source` (already
a free-form string, e.g. `"gog"` / `"humble"`) continues to carry
which storefront; `method` now correctly describes the determination
*kind* generically. Frontend's `DETERMINATION_LABELS` updated from
"GOG storefront policy" to "storefront policy" accordingly — the
`source` field already appears alongside it in the tooltip
(`drmTooltip` in `GameCard.tsx`), so nothing is lost, just no longer
mislabeled for a non-GOG storefront.

## What's on the human

Nothing new — no credentials, no deployment. Worth a real-world smoke
test on a machine with the actual Humble App installed once someone
has one available, the same way GOG's Linux/macOS Heroic-based
detection is flagged as unverified pending a real test machine.
