# 0021 — First-run onboarding lightbox with progressive disclosure

**Status:** implemented

## What changed

A three-step, blocking lightbox (`src/components/OnboardingLightbox.tsx`)
shown once on first launch (`lib/onboarding.ts`, `hasSeenOnboarding`/
`markOnboardingSeen` — same one-time-flag pattern as `lastTab.ts`),
reachable again anytime via a new "Tour" button in the header.

Steps:
1. Welcome — the manifesto's core argument in two sentences, mascot as
   the visual anchor.
2. "How do you get your games?" — a multi-select checkbox list
   (Steam/GOG/Epic/Humble/other), persisted (`loadOnboardingPlatforms`/
   `saveOnboardingPlatforms`) so re-opening the tour later doesn't
   discard a previous answer.
3. "What this app does for you" — always shows the two
   provider-agnostic pitches (local scan, DRM-free-twin + price
   comparison); the Steam-wishlist bullet and the manual-entry bullet
   are shown or hidden based on step 2's answer. Nobody selecting
   anything (skipped the question, or genuinely uses none of the named
   platforms) shows both — staying inclusive rather than hiding a
   feature that might still apply.

This is deliberately narrow progressive disclosure: the answer only
changes what *this lightbox* says next. It does not hide the Wishlist
tab, reorder the nav, or change any other part of the app based on the
answer — a much bigger behavioral change than "which onboarding
bullets are relevant," not something to do silently as a side effect
of a first-run tour.

Portaled to `document.body`, same reason and same fix as
`CompareDealModal` (decision 0018's follow-up commit): a fixed-position
overlay nested under a hovered/transformed ancestor gets clipped to
that ancestor instead of the full window.

Kept fully separate from the analytics consent banner (decision 0012)
— seeing the tour and opting into analytics are unrelated choices, and
stacking two blocking prompts on a first launch would be a lot at
once. The consent banner stays its own non-blocking strip.

## What's on the human

Nothing new — entirely local, no credentials or deployment involved.
