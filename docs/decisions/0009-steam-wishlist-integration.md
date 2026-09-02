# 0009 — Steam wishlist integration

**Status:** flagged as a potential avenue, not pursued for now

Idea: cross-reference a user's Steam wishlist against DRM-free
availability (GOG/affiliate/direct-deal catalog), to extend decision
0006's "wean off DRM" loop to games the user wants but hasn't bought
yet, not just ones they've already installed.

## Why this isn't being built

Unlike installed-game detection, a wishlist lives on Steam's servers,
not in a local manifest — there's no local-scan equivalent here.
Getting it means one of:

1. **Official Steam Web API** — requires an API key and, for a private
   wishlist, the user's own account login. This is the same shape of
   concern as decision 0002 (Steam ownership-API access), even though
   a wishlist isn't literally an owned-games list.
2. **Undocumented public JSON endpoint**
   (`store.steampowered.com/wishlist/profiles/<id>/wishlistdata/`) —
   no API key, but only works for public wishlists, is unauthenticated
   scraping of a Valve endpoint with no sanctioned integration status,
   and carries its own ToS risk (most subscriber agreements prohibit
   automated scraping) independent of the API-terms question.

Checked the actual Steam Web API Terms of Use directly rather than
from memory: it does not contain an explicit named "no competing
service" clause — the real restriction is broader and more
discretionary ("may not violate the Steam Subscriber Agreement," plus
Valve's own discretion to revoke API access). That's not a clean
green light, just a correction against overclaiming a specific
prohibition — the underlying concern (using Steam's data to power a
feature that redirects purchases to other storefronts) stands either
way.

## Lower-risk alternative, not yet built either

User-initiated, no stored credentials: let the user paste their
public Steam profile URL or otherwise manually provide wishlist data,
rather than the app querying Steam's servers on its own. This avoids
both the API-key/OAuth pattern and the scraping-ToS question, at the
cost of requiring the wishlist to be public and the user to take an
explicit action.

## Status

Not pursued in the current build. Revisit during Stage 2a's catalog
work if this becomes worth the legal/technical cost — decide the
official-API-vs-scraping-vs-manual-import question explicitly at that
point rather than defaulting into either.
