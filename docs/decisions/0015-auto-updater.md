# 0015 — In-app auto-updater

**Status:** decided, not yet live (blocked on a human step)

## Decision

Replace the old "ask GitHub's API for the latest tag, compare semver
by hand, link out to the Releases page" approach
(`src/lib/checkForUpdate.ts`, pre-2026-09-03) with Tauri's real
updater plugin: signed release artifacts, a `latest.json` manifest
GitHub publishes automatically, and an in-app "Update Now" that
downloads, verifies against a committed public key, installs, and
relaunches — no manual download required.

## Why now

"No auto-updater yet" was a known, named gap (it was literally in the
README). For a launcher whose whole pitch is being the trustworthy,
low-friction alternative, making people manually re-download and
reinstall to get bug fixes undercuts that pitch. This was flagged
earlier in the project's history as a real quality gap before serious
publisher outreach, and got deprioritized in favor of features; it's
due.

## Shape

- **Signing key**: generated via `tauri signer generate`. Public key
  is committed in `tauri.conf.json` (`plugins.updater.pubkey`) —
  that's intentional and safe, it's how clients verify an update
  wasn't tampered with. The private key is **not** in this repo (or
  any repo) — see the human TODO below.
- **Manifest endpoint**: `tauri.conf.json` points at
  `.../releases/latest/download/latest.json`, which `tauri-action`
  generates automatically once `TAURI_SIGNING_PRIVATE_KEY` is set in
  CI (see `release.yml`).
- **Frontend**: `checkForUpdate()` now calls the plugin's `check()`
  instead of hitting GitHub's REST API directly; `installUpdate()` is
  new and does download+verify+install+relaunch. The existing banner
  UI/CSS is reused — only the button's behavior changed, from
  "open the Releases page" to "Update Now."
- **Failure mode**: if `installUpdate()` throws (network blip,
  verification failure, etc.), the banner falls back to the old
  "open Releases page" link rather than getting stuck — see
  `App.tsx`'s `onUpdateNow`.

## Not yet live

Two things have to happen outside this repo before this does
anything:

1. `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   need to exist as GitHub Actions secrets — a human step, see
   `UPDATER_SIGNING_KEY.txt` (sibling to this repo, not committed).
2. GitHub's "latest release" resolution skips prereleases, and every
   release this project has cut so far is marked `prerelease: true`.
   Until a release ships without that flag, `check()` will correctly
   find nothing — which is a safe default (no half-configured update
   flow silently doing something), not a bug, but it does mean this
   decision documents the *mechanism*, not yet a live feature.

Until both land, `checkForUpdate()` just returns `null` (same as
"offline" or "no releases yet") and the app behaves exactly as it did
before this change — no user-visible difference, no risk from shipping
the client-side half early.
