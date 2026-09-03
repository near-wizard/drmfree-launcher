# 0012 — Opt-in usage analytics (PostHog)

**Status:** decided

## Decision

The app ships with PostHog-based usage analytics, **opt-in and off by
default**. On first launch a banner asks once; nothing is sent unless
the user clicks "Allow". Declining (or ignoring the banner) means zero
network activity from the analytics module — no beacon, no anonymous
ID, nothing. The choice is stored locally and can be flipped anytime
from the "Analytics: On/Off" toggle in the tab bar.

## What's collected

Coarse, feature-level events only — which parts of the app get used,
not what's in them:

- Navigation: tab changes, app opened
- Library actions: game launched, library rescanned, filter/sort
  changed, search performed (event only — never the query text)
- GOG upgrade-check: check clicked, result (found/not-found), "buy"
  link clicked
- Store tab: search performed (no query text), NSFW toggle, load
  more, buy link clicked
- Update banner: shown, download clicked, dismissed
- Consent itself: granted

Each event carries at most a small, non-identifying property (e.g.
`provider: "steam"`, `sort_by: "name"`). Game names, search text, file
paths, and install locations are never sent — the properties are
hand-picked per call site, not an automatic payload dump.

## Why

Understanding which features actually get used (Store tab vs. upgrade
finder vs. plain library management) matters for prioritizing further
work, especially heading into outreach with indie devs/publishers
where "here's what players actually do" is useful. But decision 0002
already committed this project to a no-ownership-API, local-scan-only
posture specifically to avoid phoning home — silently adding telemetry
would contradict that stance. Opt-in, not opt-out, resolves the
tension: the capability exists, but nothing runs until the user
explicitly says yes.

## Implementation notes

- `src/lib/analytics.ts` wraps `posthog-js`; `track()` is a no-op
  unless consent is `"granted"`.
- PostHog's project API key (`VITE_POSTHOG_KEY`) is public/embeddable
  by design — it identifies a project, not a secret credential — so
  it's safe to bake into a distributed build, unlike the affiliate tag
  in decision 0011.
- Without `VITE_POSTHOG_KEY` set at build time, the analytics code
  still runs but has nowhere to send events (silent no-op); the app is
  fully functional either way.
