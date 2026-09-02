# 0005 — DRM-free is a catalog filter, not just a launcher feature

**Status:** decided

The project's identity is DRM-free games, not "aggregator with an
affiliate program bolted on." This constrains Stage 2a and beyond:

- Only **DRM-free storefronts** are eligible for affiliate
  integration — confirmed starting point is GOG. A storefront that
  primarily distributes Steam keys or other DRM-wrapped copies (e.g.
  Fanatical, Green Man Gaming, most of Humble Store) does not qualify
  wholesale, even where it runs an affiliate program.
- Where a storefront sells a *mix* of DRM-free and DRM-wrapped titles
  (e.g. itch.io, parts of Humble Bundle/Humble Store), eligibility is
  **per-title**, not per-storefront: only list titles confirmed
  DRM-free. This needs a way to verify DRM status per listing before
  a storefront is added — not just plugging in an affiliate feed and
  showing everything in it.
- This filter also applies to Stage 2b direct publisher deals later:
  a publisher relationship doesn't override the DRM-free requirement.

Storefront sequencing: GOG (confirmed) → itch.io next (evaluate its
affiliate/referral mechanism and per-title DRM-free verification) →
others TBD, decided one at a time rather than batched.

Still open: how per-title DRM-free status gets verified before a
listing goes live (itch.io has no single "DRM-free" flag on its API —
this needs a real answer, not an assumption, before itch.io is added).
