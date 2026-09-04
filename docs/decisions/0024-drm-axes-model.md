# 0024 — Granular per-axis freedom tests, alongside DrmRecord, not replacing it

**Status:** implemented (data model + community-report round trip; see
"What's deferred" below)

## Context

`DrmRecord` (decision 0008) collapses everything about a game's DRM
situation into one `DrmStatus` — `drm-free`, `drm`, or `unknown` — plus
a single provenance string. That's too coarse for what players
actually want to know: a game can require one-time online activation
and otherwise be fully portable, or run with no storefront client at
all but still phone home to a publisher's auth server. Neither of
those is honestly "DRM-free" or "DRM," and collapsing them into one
enum throws away exactly the distinction someone deciding whether to
buy the game would want.

The user specified an eleven-test model across five dimensions
(network, account, client, installation, external-service
independence) and two explicit scoping calls:

- Store the raw per-axis results. Don't collapse them into named tiers
  yet — "tiers can be figured out later if at all." Nothing here
  derives a Tier 1–7 style label from the axes.
- Keep the schema, scoring logic, and UI public in `drmfree-launcher`
  — same precedent as `DrmRecord` itself, which decision 0011 calls
  "a data shape, not a data asset." The actual crowd-submitted *votes*
  still flow through the existing private `drmfree-community` backend,
  reusing its rate-limiting/anti-abuse infrastructure rather than
  standing up a second one — decision 0014's reasoning for why that
  backend is closed applies equally to axis votes as it does to status
  votes.

## What changed

**`src-tauri/src/drm_axes.rs`** (new): `AxisResult` (`Pass`/`Fail`/
`Unknown` — three-state like `DrmStatus`, because "untested" has to be
distinguishable from "tested and fails"), and `DrmAxes`, one field per
test:

- **A — Network independence**: `first_launch_offline`,
  `continued_offline_play`
- **B — Account independence**: `no_publisher_account`,
  `no_storefront_account`
- **C — Client independence**: `no_storefront_client`, `no_launcher`
- **D — Installation portability**: `copyable_install`,
  `reinstallable_from_offline_media`
- **E — External-service independence**: `no_publisher_auth_servers`,
  `no_third_party_services`, `no_server_dependent_core_features`

`Game` gains `drm_axes: Option<DrmAxes>` — always `None` from every
provider today, deliberately: no provider does its own axis testing
locally, this only ever comes from folding in a community-consensus
lookup client-side, exactly parallel to how `DrmRecord`'s own
consensus overlay (`effectiveDrm` in `GameCard.tsx`) already works.
Mirrored in `src/types/drmAxes.ts`.

**`src-tauri/src/community.rs`**: `SubmitReportBody` gains an optional
`axes: Option<AxisVotes>` (two-state `Pass`/`Fail` per axis, all
optional — a report can vote on any subset), omitted entirely rather
than sent as `null`/`{}` when empty so an unmodified status-only
report produces the exact same request body it always has.
`CommunityConsensus` gains `axes: AxisConsensusCounts` — raw
pass/fail/total counts per axis, `#[serde(default)]` so an
un-upgraded `drmfree-community` deployment doesn't break every
consensus fetch. Field names match `DrmAxes`'s one-for-one so the two
schemas don't drift into separate naming schemes for the same eleven
tests.

**`src/lib/drmAxesConsensus.ts`** (new): `deriveAxisResults` reuses
`communityConsensus.ts`'s exact `MIN_REPORTS`/`MIN_MAJORITY_RATIO`
constants (now exported, not duplicated), applied independently per
axis — nine axes having a strong consensus doesn't lend any weight to
the tenth. Each of the eleven tests is its own falsifiable claim.

**`CommunityReport.tsx`**: a collapsed "Report a freedom test" section
under the existing status-report control, grouped into the same five
categories, Pass/Fail toggle buttons per axis. Collapsed by default —
the existing simple status flow isn't buried under this.

**`GameCard.tsx`**: a compact pips row under the DRM badge, one pip
per category (not per individual axis — eleven pips on every card
would be visual noise most of the time), collapsed to
`pass`/`fail`/`partial`/`unknown` per category and expandable to the
full eleven-line breakdown on click. Only rendered when there's
*some* axis data — an all-unknown row for a title nobody's tested yet
is not information worth taking up card space over.

## What's deferred

- **Tier derivation.** Not touched. May never be — the user's own
  words.
- **`FreedomDashboard`'s stats and `App.tsx`'s library filter** — both
  still read only `game.drm.status`, same as before this change. Not
  widening the existing decision-0016-acknowledged gap (community
  consensus already isn't folded into those two) in this pass.
- **A reviewer/reputation system for `drmfree-community`** — its
  `TODO.md` already flags this as a known gap; unrelated to this
  change.

## What's on the human

`drmfree-community`'s `store.js`/`server.js` need the matching
extension (accept/aggregate/return the new `axes` field) before any
of this actually round-trips against a real deployment — tracked as a
companion change in that repo, not this one.
