# 0010 — itch.io evaluated for Stage 2a: not added yet

**Status:** decided (not pursued for now — blocked on two independent gaps)

Decision 0005 named itch.io as the next storefront to evaluate after
GOG, on both its affiliate/referral mechanism and its per-title
DRM-free verification story. Checked both directly rather than
assuming; both come back blocking, independently of each other.

## Affiliate/referral: no commission program exists

itch.io's "Partners & Affiliates" system (itch.io/partners) tracks
referral attribution via affiliate codes, but the payout model is
**content-creator-to-developer free access exchanges**, not a
platform-wide cash commission on driven sales — there's no percentage-
of-sale feed comparable to GOG's affiliate program to plug into. An
itch.io staff reply (2018, in itch.io/t/224286) confirms this
directly: "We don't offer a financial share for regular referrers
right now." Community threads asking when a real revenue-share
program would launch continue as recently as mid-2025 with no
resolution found. There is currently nothing to integrate here.

## Per-title DRM-free verification: no API field, community tag only

itch.io's server-side API (itch.io/docs/api/serverside) only exposes
data for games *you* upload (`/profile/games` — cover, price, title,
view/download counts), not a searchable catalog with tags or platform
metadata. There is a "DRM Free" tag games can carry
(itch.io/games/tag-drm-free), but it's developer-self-applied with no
itch.io-side verification — the exact "no single DRM-free flag"
problem decision 0005 flagged as needing "a real answer, not an
assumption" before itch.io could be added. Scraping the tag page
would mean trusting an unverified, spoofable signal for a purchase
recommendation, which decision 0005's per-title eligibility bar
doesn't allow.

## Status

Not pursued. Revisit if either changes: itch.io ships a real
commission-based affiliate program, or exposes a verified (not
self-reported) per-title DRM-free signal via its API. Until then,
Stage 2a stays GOG-only; the next storefront to evaluate, if any, is
still open per decision 0005's "decided one at a time" sequencing.
