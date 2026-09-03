# 0011 — Open-core boundary: concrete split

**Status:** decided

Decision 0001 set the principle (launcher open, marketplace/payments/
publisher tooling closed) before there was much code to draw the line
through. Now that the Store tab and upgrade-prompt loop exist, this
makes the split concrete.

## Stays open (this repo)

- **Local library detection/launch** (`providers/`) — pure local-scan
  logic, decision 0002.
- **DRM status schema + provenance** (`DrmRecord`,
  `DrmDeterminationMethod`) — a data shape, not a data asset.
- **GOG catalog browsing** (`store.rs`) — calls GOG's own *public*
  catalog/product APIs, no credentials involved.
- **Title-matching algorithm** (`find_gog_match`, `clean_search_query`,
  `normalize_title`) — a technical capability ("does local game X
  match catalog entry Y"), not a business asset. Keeping it open also
  means community contributors can improve the matching heuristics.
- **UI/UX** for source badges, "Buy DRM-free" prompts, the Store tab.
- The *stated* source-priority principle from decision 0006 (direct
  deals beat GOG affiliate when both exist) — the rule itself is just
  a sentence, not sensitive.

## Moves to a closed/private backend (not yet built)

- **Direct publisher/indie deal data** (Stage 2b) — deal terms,
  revenue share, which publishers, negotiated pricing. Unambiguous
  per decision 0001.
- **Affiliate tag injection.** Concrete gap as of this decision: the
  "Buy on GOG" / "Buy DRM-free on GOG" links in this codebase are
  currently *plain, untagged* GOG URLs — there is no affiliate ID
  anywhere in the client. When one exists, it must not live in the
  open client: anyone could extract and reuse it, and there'd be no
  way to rotate it without shipping a new app release. The intended
  shape is a thin server-side redirect (e.g.
  `yourapp.com/go/gog/<id>` → look up the real URL, append the tag,
  redirect) — this is the actual next infra piece behind monetization,
  not something to bolt onto the open client.
- **Evaluating source priority when it depends on live business data**
  — e.g. a publisher paying for placement, an exclusivity window. The
  *rule* stays open (see above); *applying* it once real deals exist
  needs the private backend's data, since the inputs themselves are
  confidential.

## Why now

The Store tab and upgrade-prompt loop (decisions 0005/0006) made this
concrete enough to need an explicit line, rather than relying on
0001's more abstract principle. Revisit when the affiliate-redirect
service or Stage 2b backend actually gets built — this doc records
the intended shape, not an implementation.
