# 0006 — DRM-free upgrade path is the core value loop

**Status:** decided (feature scoped for Stage 2a, not yet built)

The product isn't just "a launcher that also sells DRM-free games" —
the core loop is: bring your existing (mostly DRM-locked) library in,
then help the user migrate off DRM where a DRM-free alternative
exists. Concretely:

- The launcher keeps launching Steam (and other DRM) games it
  detects — that's not going away, and isn't gated on anything else.
- Where a detected Steam title has a DRM-free equivalent in our
  catalog, show a "Buy DRM-free version" action alongside it.
- **Purchase-source priority when a DRM-free equivalent exists in
  more than one place:** our direct publisher deals first, GOG (or
  other affiliate DRM-free storefronts) second. Direct deals are
  preferred once they exist because they carry no affiliate
  dependency and support publishers more directly; affiliate
  listings are the bridge until a direct deal exists for that title.
- This stays a *separate, clearly-labeled action* on a library
  entry — not a merged "buy" button that blurs into the launch
  flow, consistent with Principle 3 (no blended UX) and decision
  0002's "Buy on GOG" labeling requirement for affiliate listings.

## Why this doesn't start in Stage 0

Surfacing "buy DRM-free version" requires:
1. A DRM-free catalog to match against (Stage 2a: GOG affiliate
   catalog, later itch.io, later direct publisher titles).
2. A **title-matching mechanism** between a locally-detected Steam
   game and a catalog entry — not yet designed. Naive name matching
   will produce false positives/negatives (sequels, editions, demos
   vs. full games — note the real Steam library already surfaced a
   "Half Sword Demo" during testing, which must not match against a
   paid catalog entry for the full game).

Both are Stage 2a prerequisites. Once the GOG affiliate catalog
exists, this becomes the first consumer of it inside the launcher UI.

## Open, not yet decided
- Exact title-matching approach (exact name match seeded manually at
  first, vs. a fuzzy/ID-based matching system later).
- Whether "own it on Steam already" suppresses or de-emphasizes the
  upgrade prompt for that specific title vs. always showing it.
