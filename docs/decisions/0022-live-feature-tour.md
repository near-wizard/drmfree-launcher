# 0022 — Replace the onboarding lightbox's feature list with a live spotlight tour

**Status:** implemented

Direct user feedback on decision 0021's third step (a static bullet
list describing features inside the modal): "I want it to walk you
through using the application features" — a modal *describing* the UI
isn't the same as *walking through* it. This replaces that step with
`FeatureTour.tsx`, a coach-mark tour over the real, live UI.

## What changed

The lightbox (`OnboardingLightbox.tsx`) is now just two steps — welcome
and the "how do you get your games" question. Finishing it hands off
to `FeatureTour`, which:

- Switches tabs itself (Library → Wishlist → Store) as each step
  requires, via the same `onChangeTab` callback App.tsx already uses
  for the tab bar.
- Spotlights the actual target element for each step — found via a
  `data-tour="..."` attribute added to six real elements (the add-manual
  button, freedom dashboard, "check library" button, library search,
  wishlist input, store search), not a class name, so this can't
  silently break or mismatch when styling changes.
- Still tailored by decision 0021's platform question:
  `buildTourSteps()` in App.tsx skips the freedom-dashboard/check-library/
  search steps entirely for an empty library, and skips the Wishlist
  step unless Steam was selected (or nothing was selected — stays
  inclusive over guessing wrong).
- Is deliberately non-blocking: the dimmed overlay has
  `pointer-events: none`, so the real app underneath — including the
  exact element being spotlighted — stays fully interactive. Trying a
  feature while it's being explained works, rather than fighting a
  modal to get out of the way first.

## A real bug found live, not by the test suite

The first implementation measured each target's position once
(`requestAnimationFrame` + a `window.resize` listener) and never
again. Live testing surfaced a real drift: clicking the spotlighted
"+ Add a DRM-free game" button (allowed, since clicks pass through)
expands a form above the search box being spotlighted next — that
shifts the search box down, but nothing had told the spotlight to
re-measure, since the window itself never resized. The highlight ended
up boxing an unrelated element entirely.

Fixed by tracking continuously: a `requestAnimationFrame` loop
re-measures the current target every frame for as long as that step is
showing (cancelled on step/tab change or unmount), rather than a
one-shot measurement. Re-verified live afterward, all six steps,
including the exact element that had drifted before the fix.

Portaled to `document.body`, same reason `CompareDealModal` (decision
0018) and the lightbox itself already are.

## What's on the human

Nothing new — entirely local, no credentials or deployment involved.
