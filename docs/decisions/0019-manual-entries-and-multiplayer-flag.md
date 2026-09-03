# 0019 — Manual DRM-free entries, and a multiplayer-needs-platform flag

**Status:** implemented

Two A-tier ideas from `PRODUCT_IDEAS.md`, both picked for being cheap
("Now" effort) and self-contained (no backend/deployment dependency),
unlike most of the S-tier items already shipped in decision 0018.

## Manual "I own this DRM-free" entry

Decision 0010 evaluated itch.io as a storefront and deliberately didn't
add it as a full provider (no real affiliate program, no verified
per-title DRM-free signal). That left a real gap: someone who owns
itch.io (or any other undetected storefront's) purchases had no way to
have them reflected in this app at all.

`src/lib/manualGames.ts` adds a localStorage-backed CRUD for
user-declared entries (name, optional exe path, optional install
dir), converted to `Game` objects with `provider: "manual"`,
`drm.status: "drm-free"`, `drm.method: "manual_review"`. This is a
looser use of `manual_review` than decision 0008's original doc
comment ("a maintainer of this project checked the title by hand") —
justified because these entries are purely local and never submitted
anywhere, so there's no downstream trust system (community consensus,
etc.) that could conflate a random user's self-declaration with a
maintainer's verified review.

Manual entries merge into the library at render time
(`App.tsx`'s `allGames` memo) rather than living in the same state as
detected games, so a Rescan can never wipe them. They're launched via
`@tauri-apps/plugin-opener`'s `openPath`/`revealItemInDir` client-side
rather than the backend's `launch_game`/`open_install_folder`
commands, since those route through the `GameProvider` registry and a
manual entry has no corresponding provider. GOG-upgrade-checking and
community-consensus fetching are both skipped for manual entries — the
former is meaningless (already DRM-free by declaration), the latter
would be a wasted network call (manual ids are random per-install
UUIDs, never shared across users).

## Multiplayer-needs-platform flag

A game can be DRM-free for its base install while multiplayer still
requires the original platform's servers/account — a real, easy-to-miss
distinction the existing binary DRM badge doesn't capture. Rather than
extend decision 0014's community-reporting schema (the backend for
that isn't even deployed yet, per `HUMAN_TODO.md`, so a crowd-sourced
version would be inert on arrival), this ships as a local per-game
toggle (`src/lib/multiplayerFlag.ts`) — a small amber "MP needs
{platform}" badge next to the DRM badge, settable via a 🌐 button that
only appears once a game's effective DRM status is already
`drm-free`. Immediately useful to the one person who knows the nuance
the moment they set it, without waiting on report volume.

## What's on the human

Nothing new — both features are entirely local, no credentials or
deployment involved.
