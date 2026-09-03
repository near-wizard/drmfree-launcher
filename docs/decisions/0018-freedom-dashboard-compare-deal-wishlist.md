# 0018 — Freedom dashboard, "compare the deal" view, and wishlist cross-reference

**Status:** implemented

Three features built together because they compound: the wishlist
cross-reference finds a DRM-free match, the compare view is what makes
that match persuasive, and the freedom dashboard is where a user sees
the cumulative effect of acting on both. Picked from a broader
brainstorm (`PRODUCT_IDEAS.md`, outside any git repo) as the top three
by impact — the ones that put the manifesto's actual argument in front
of a user at or near the moment it's decision-relevant, rather than
only in a doc.

## What changed

- **`FreedomDashboard`** (`src/components/FreedomDashboard.tsx`,
  stats in `src/lib/freedomStats.ts`): "N of M games are DRM-free"
  with a progress bar, shown above the library list whenever there's
  at least one game. Counts only a game's own recorded
  `drm.status === "drm-free"` — deliberately *not* promoted by
  community consensus (see decision 0016) — so this stays a
  conservative floor rather than the more optimistic number an
  individual card's badge can show.

- **`CompareDealModal`** (`src/components/CompareDealModal.tsx`): a
  two-column "Steam/Epic: revocable license..." vs. "GOG: yours
  forever..." comparison, opened from a new "Compare" button next to
  the existing "Buy DRM-free on GOG" button in `GameCard`'s
  `GogUpgradeCheck`, and reused identically from the wishlist view
  below. Per-provider trait copy with a generic fallback for any
  provider not explicitly listed, so a future provider doesn't
  silently break this.

- **Wishlist cross-reference** (`src/wishlist/WishlistView.tsx`, new
  "Wishlist" tab): paste a SteamID64 (or a `/profiles/<id>/` URL — not
  a vanity `/id/` URL, which needs a Steam Web API key this project
  doesn't have one of), load the public wishlist, and cross-check each
  title against GOG the same way the existing per-game "Check GOG"
  button does — literally the same function
  (`checkGogMatch`/`gogMatchCache`), retyped to accept a structural
  `{provider, id, name}` shape instead of requiring a full `Game`, so
  a wishlist entry and an installed game share one cache and one code
  path.

  Backend: `providers::steam::get_steam_wishlist` calls Steam's public
  `IWishlistService/GetWishlist/v1` (steamid-only, no API key — see
  research notes below), then resolves each `appid` to a name/cover
  via the same `appdetails` endpoint the Steam cover-art fallback
  (decision-adjacent fix, see git log) already uses. Capped at 60
  items (`WISHLIST_ITEM_CAP`) to bound worst-case latency — noted in
  the UI when hit, not silently truncated.

## Why Steam's wishlist API and not the old `wishlistdata` endpoint

Verified before building: the historical
`store.steampowered.com/wishlist/profiles/<id>/wishlistdata/` endpoint
used by most existing community tooling is dead — it now redirects to
the Steam store homepage regardless of cookies (confirmed live). The
current `IWishlistService/GetWishlist/v1` Web API endpoint is the
supported replacement, needs no API key, but only returns
`appid`/`priority`/`date_added` — never a title — hence the extra
per-item `appdetails` round trip. Wishlist visibility is also a
separate opt-in from profile visibility (most accounts default to
private), which is why an invalid ID and a private/empty wishlist are
indistinguishable from this API's response — the UI copy covers both
in one message rather than guessing which case it is.

## What's on the human

Nothing new — no credentials or deployment steps involved. Both new
Steam endpoints used here are public and keyless, same as the existing
`appdetails` cover-art fallback.
