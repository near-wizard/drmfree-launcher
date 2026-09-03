# 0016 — Community consensus feeds the DRM badge, not just a side counter

**Status:** decided and built

## Context

Decision 0008 defined `DrmDeterminationMethod::community_review` as a
placeholder variant so a future record could say "this status came
from community reports" — but nothing ever constructed one. Decision
0014 then shipped community DRM-status reporting, but only as a
side-by-side trust signal (the 🤝 counter and report control in
`CommunityReport.tsx`); a title's actual `drm.status`/badge stayed
whatever the local record already said (in practice: `unknown` for
every non-GOG title, since `gog_import` is still the only method any
provider ever constructs). The two features existed but weren't
connected, even though the schema was built for exactly this.

## Decision

`src/lib/communityConsensus.ts` adds a pure `applyCommunityConsensus(drm,
consensus)` that promotes a game's displayed DRM record to a
community-derived one — but only when:

- the local record has no determination at all (`drm.method === null`,
  i.e. genuinely `unknown` today), and
- at least 3 community reports exist for that title, and
- one status holds at least 60% of them (a real majority, not a
  single opinion).

It never overrides a storefront-verified (`gog_import`),
publisher-declared, or previously manually-reviewed record — community
signal fills a gap, it doesn't contest an existing determination.

`GameCard.tsx` now fetches the consensus once (previously
`CommunityReport.tsx` fetched it independently, purely for its own
counter) and uses it both for the report widget and to derive the
badge shown via `drmTooltip`, which already handled unlabeled sources
by showing "no verified DRM source yet" — a community-derived record
now has a `source`/`method` like any other, so the tooltip path needed
no changes.

## Why this, why now

This is close to the smallest change that makes "DRM-Free Steam" (a
launcher that surfaces DRM status for titles no single storefront will
tell you the truth about) actually work for the majority of a typical
library — GOG-catalog games aside, most installed titles come from
Steam or Epic, where `drm.status` was always `unknown` before this,
regardless of how many people had already told the community it's
locked or free. The infrastructure (schema, reporting endpoint,
backend) was already built and unused for this purpose; this is
wiring, not new infrastructure.

## What's still explicitly out of scope

- The library-wide filter/sort by DRM status (`App.tsx`'s `drmFilter`)
  still reads `game.drm.status` directly, not the community-derived
  effective status — a title newly promoted by consensus shows the
  right badge on its card but won't move between filter buckets until
  a real backend-side aggregation feeds it back into `list_games`
  itself. Left alone this cycle: doing it right means computing
  consensus for the whole library up front (extra request fan-out
  against a small free-tier backend) rather than per-card, which is a
  bigger change than this decision's scope.
- Thresholds (3 reports, 60%) are a starting guess, not tuned against
  real report volume — revisit once `drmfree-community` has a real
  deployment and actual data.
