# 0017 — Wire "Buy" links through the affiliate redirect service

**Status:** implemented (client side), inert until deployed

Decision 0011 named the concrete gap: "Buy on GOG" links in this
codebase are plain, untagged GOG URLs, and the intended shape is a
thin server-side redirect that looks up the real URL, appends a
tracking tag, and 302s. `drmfree-redirect` (private repo) already
implements that redirect (`/go?url=<dest>`, host-allowlisted to
`gog.com`, falls back to an untagged pass-through when no affiliate
template is configured on its end) — but nothing in this codebase
ever called it. Every "Buy" click sent players straight to GOG with
no tag, whether or not the redirect service was deployed.

## What changed

`src-tauri/src/store/mod.rs` gained `affiliate_redirect_base_url()`
(an `option_env!("AFFILIATE_REDIRECT_URL")`, baked in at compile time
— same pattern as `COMMUNITY_API_URL` in `community.rs` and the
PostHog key in `src/lib/analytics.ts`) and `apply_affiliate_redirect`,
which rewrites every `StoreListing.store_url` to
`{base}/go?url={encoded destination}` in `search_store` before
returning results, when that env var is set. Unset (ordinary
`cargo build`/dev/CI today), it's a no-op — listings carry the same
plain GOG URLs as before.

This is deliberately in `search_store`, not per-source — the redirect
service's job (validate host, apply tag) is the same regardless of
which `StoreSource` produced the listing, so new sources don't need
to remember to wire this themselves.

## Why now

Cost of building this ahead of the redirect service actually being
deployed is low (a pure string-rewrite function, unit tested) and the
payoff is that deploying `drmfree-redirect` and setting one env var in
CI is the *entire* remaining step — no app code change, no new
release needed just to turn revenue on. Building it later would mean
either a rushed change right when the redirect service goes live, or
shipping a release that still doesn't use it.

## What's still on the human (see HUMAN_TODO.md)

- Deploy `drmfree-redirect` somewhere reachable.
- Set `AFFILIATE_REDIRECT_URL` (this decision) as a build-time env var
  wherever release builds happen, the same way `COMMUNITY_API_URL` is
  already documented as needing to be (decision 0014) — neither is
  wired into `.github/workflows/release.yml` yet because neither
  service is deployed yet; that's one `env:` block to add per service
  once there's a real URL to put there.
- Get the real Adtraction tracking-link template into
  `drmfree-redirect/.env` — `drmfree-redirect` itself already falls
  back to untagged pass-through without it, so this app-side change
  doesn't depend on that step being done first.
