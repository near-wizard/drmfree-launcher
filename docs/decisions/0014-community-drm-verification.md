# 0014 — Community DRM-status verification

**Status:** decided

## Decision

Add a community reporting layer on top of the existing DRM status
schema (decision 0008): players can confirm or dispute a title's DRM
status from firsthand experience, and the aggregate is surfaced back
in the UI as a trust signal independent of any single storefront's
claim about its own game.

Shape:

- **Open (this repo):** `src-tauri/src/community.rs` (the Tauri
  commands `submit_drm_report`/`get_community_consensus`),
  `src/lib/community.ts`, `src/components/CommunityReport.tsx`. This
  is UI and a thin HTTP client — no business-sensitive logic.
- **Closed (`drmfree-community`, a new private repo):** the actual
  storage, aggregation, and rate-limiting/abuse-resistance logic.
  Same reasoning as decision 0011's affiliate-redirect example: the
  moderation posture and anti-abuse thresholds benefit from not being
  fully public, even though nothing about *what the feature does* is
  hidden.

No accounts. The client generates an opaque id once and keeps it in
localStorage — enough to rate-limit and to let a person update their
own prior report, not enough to build a real identity graph. See
`drmfree-community/README.md` for the full reasoning.

## Silent no-op when unconfigured

`COMMUNITY_API_URL` is baked in at compile time via `option_env!`,
mirroring the affiliate-tag pattern (decision 0011) and the PostHog-key
pattern (decision 0012): unset in an ordinary build, the Rust commands
degrade cleanly (`get_community_consensus` returns `Ok(None)`,
`submit_drm_report` returns a named "not configured" error) and
`CommunityReport.tsx` renders nothing at all when consensus comes back
`null`. The feature ships in every build; it just doesn't do anything
until a real `drmfree-community` deployment sets the env var in CI.

## Why now

Requested directly, and it's the single feature most in line with the
project's stated stance (see `MANIFESTO.md`): "community trust beats
platform trust" only means something if there's an actual mechanism
for the community to register that trust, instead of the app only
ever trusting GOG's own catalog metadata for what counts as
"DRM-free."

## What's explicitly MVP, not finished

- Reports are a flat JSON file on the backend (see
  `drmfree-community/src/store.js`) — fine for low volume, not a
  scaling plan.
- No moderation/review queue yet — abuse resistance is rate-limiting
  only.
- The report control lets a user pick a status and submit; it doesn't
  yet collect the optional note the backend already supports (kept
  out of v1 to keep the inline UI small — see
  `drmfree-community/TODO.md`).
- `COMMUNITY_API_URL` has no real deployment yet; see
  `drmfree-community/TODO.md` for that human follow-up.
