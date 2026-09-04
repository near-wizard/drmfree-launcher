# 0025 — Local automation for some DRM axes, not all eleven

**Status:** implemented (structural lookup + launch smoke test; see
"What's deferred" below)

## Context

Decision 0024's eleven freedom tests are all filled in by a person
clicking Pass/Fail from memory today. The user asked whether some of
these could be tested automatically instead.

## The honest per-axis answer

Not "yes, automate all eleven" — a real feasibility split:

- **Free, no live test needed at all**: `no_storefront_client` and
  `no_launcher` are already known facts, not things to test. GOG and
  Humble's own `launch()` implementations run the exe directly by
  construction; Steam and Epic always mediate through a protocol
  handler. This is a deterministic lookup keyed on `provider`
  (`structural_axes` in `src-tauri/src/axis_test.rs`), zero risk, no
  process launch, safe to run for every card unconditionally.
- **Genuinely automatable, but only a heuristic**: `first_launch_offline`
  can get a real, if weak, signal by spawning the exe and watching
  whether it stays alive past a short window instead of crashing
  (`run_launch_smoke_test`, same file). Only meaningful for GOG/Humble
  titles — the only providers with a real local exe path (Steam/Epic's
  `Game.exe_path` is a protocol-launch id, not something
  `Command::new` can spawn). A game stuck on an error dialog and a
  game that's actually playable both look identical to this check
  ("still running") — it's a smoke test, not proof of anything about
  actual offline play.
- **Automatable, but bigger and riskier — not built here**: a sharper
  version of the smoke test that actually blocks network access needs
  a temporary Windows Firewall rule, which needs administrator
  elevation (a UAC prompt) and guaranteed cleanup even on crash — a
  real permission escalation and a real support burden if that
  cleanup ever fails and leaves a stale block rule behind.
  `copyable_install` (D1) is technically simpler (copy the install
  dir, check the exe still runs from the copy) but costs real disk
  space and time per test. Both deferred, not this pass.
- **No automation path at all**: `no_publisher_account`/
  `no_storefront_account` (recognizing a login screen has no generic
  signal), `reinstallable_from_offline_media` (needs offline installer
  media this app doesn't have), `continued_offline_play` (needs
  sustained real play, not a smoke test), `no_server_dependent_core_features`
  (which features are "core" vs. optional is a per-game judgment
  call). These stay human-only, permanently.

## What this pass builds

- `src-tauri/src/axis_test.rs`: `structural_axes(provider)` (pure
  lookup, `#[tauri::command]`) and `run_launch_smoke_test(exe_path,
  timeout_secs)` (spawns via `tokio::process::Command`, not
  `open::that()` — the first place this codebase keeps a process
  handle to actually watch, since every existing `launch()` is
  fire-and-forget). Never kills a process still running at the
  deadline — by then it's just the user's game, actually launched.
- `src/lib/localAxisTests.ts`: wraps both commands, persists results
  per `(provider, gameId)` in `localStorage`
  (`drmfree-launcher:local-axis-tests`) — same pattern as
  `multiplayerFlag.ts`.
- `GameCard.tsx`: structural axes run automatically per card (no
  button, no risk). A "Run automated test" button (GOG/Humble only)
  triggers the smoke test. Both surface as a distinctly-labeled "your
  machine:" pips row, separate from the community consensus pips row
  already there, so an automated heuristic is never visually confused
  with a person's actual judgment.

## Trigger model and result scope — both explicit user decisions

- **Trigger**: explicit, one game at a time, user-clicks-a-button —
  not background/automatic. Scheduled and bulk (a chosen set, or the
  whole library) are wanted later; `run_launch_smoke_test` is written
  to be reusable for that (a loop over many games calling the same
  command) without needing an architectural change, but no
  scheduler/bulk runner is built in this pass.
- **Result scope**: a local-only badge, never auto-submitted to the
  shared `drmfree-community` consensus pool. A "Share this result"
  button pre-fills `CommunityReport.tsx`'s existing vote state
  (`shareableVotes` in `localAxisTests.ts`) — the human still has to
  click the same "Submit freedom test results" button that already
  exists for a manual report. Avoids one machine running a heuristic
  check thousands of times skewing a pool meant to represent
  independent human judgment, and avoids silently blending a bot
  check with a person's actual experience in the same aggregate.

  The Share button is gated on the same `consensusLoaded && consensus
  !== null` condition `CommunityReport` itself renders behind — found
  via a real test failure, not by inspection: clicking Share before
  the community section had finished loading set a share signal with
  no mounted component to receive it, silently losing the share.
  Gating the button the same way the thing it targets is gated makes
  that race structurally impossible rather than just unlikely.

## What's deferred

- Network-blocked variants of the smoke test (needs elevation + a
  firewall-rule mechanism with guaranteed cleanup).
- `copyable_install` (D1) automation.
- Any scheduling or bulk/whole-library runner.
- Auto-submission of automated results to `drmfree-community`.

## What's on the human

Nothing new — entirely local, no credentials or deployment involved.
