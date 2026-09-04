# 0026 — Consolidated "Run audit" action, a network-observation probe, and opt-in auto-submit

**Status:** implemented

## Context

Decision 0025 built two separate pieces: a free structural lookup
(`no_storefront_client`/`no_launcher`) and a standalone launch smoke
test for `first_launch_offline`, both local-only with no auto-submit
path. The user asked to push automation further, consolidate it into
a single "run the audit" action from the launcher UI, and add the
ability to submit audit results to the community — with a checkbox to
pre-authorize auto-submission, or a manual submit afterward.

## What changed

**A third axis becomes automatable, from the same launch.**
`axis_test.rs` gained a read-only Windows TCP-connection-table probe
(`GetExtendedTcpTable`, filtered by PID) — no elevation required,
unlike the *blocking* firewall-rule approach decision 0025 explicitly
deferred for exactly that reason. `run_launch_smoke_test` became
`run_launch_audit`, spawning the exe once and deriving **two** results
from that single launch instead of one:
- `first_launch_offline` — unchanged liveness heuristic.
- `no_third_party_services` — `Fail` if the process opened any real
  outbound connection (a nonzero remote address; a listening socket's
  remote address is always zero) while starting up, `Pass` if it
  opened none, `Unknown` on a non-Windows build where the probe isn't
  implemented. Still not proof of anything past the first few seconds
  of launch — a game that phones home only once past a menu wouldn't
  be caught by this.

**One action, not two.** `runFullAudit` (`localAxisTests.ts`) runs the
structural lookup and, when a real exe path exists, the launch audit,
in one call. `GameCard.tsx`'s two separate entry points (an automatic
mount-time structural check plus a manually-triggered smoke test
button) collapse into a single explicit "Run audit" button — structural
axes still also run automatically on mount (free, no process launch,
unchanged from 0025), so the button's job is specifically "do the part
that requires actually launching the game."

**Auto-submit, opt-in, off by default.** A new checkbox next to "Run
audit" — "Auto-submit results" — persists a **global** preference
(`getAutoSubmitAuditResults`/`setAutoSubmitAuditResults`, not per-game;
this is "how do you want audits to behave," not a per-title setting).
When checked, finishing an audit immediately calls `submitDrmReport`
with whatever axes came back `pass`/`fail` (via the existing
`shareableVotes` helper), tagged `source: "auto_submit"` in analytics
so it's distinguishable from a manual report. When unchecked (the
default), behavior is exactly decision 0025's: a local-only badge, a
manual "Share this result" button pre-fills the existing report form,
nothing is sent until a human clicks Submit there. This reverses
0025's flat "never auto-submit" stance, deliberately — the user
explicitly asked for the opt-in path this time, with the checkbox
itself preserving 0025's actual underlying concern (a machine
submitting *without a human choosing to*): auto-submit is off by
default and every submission still traces back to someone turning
that checkbox on.

## What's still deferred (unchanged from 0025)

- Network-blocked variants (this pass only *observes* connections
  while network is available — it still never blocks anything, which
  is what needs elevation).
- `copyable_install` (D1) automation.
- Any scheduling or bulk/whole-library runner — `runFullAudit` is
  written to be called per-game in a loop without further changes, but
  no such loop exists yet.

## What's on the human

Nothing new — the network probe is a local, read-only, unprivileged
query; no credentials or deployment involved.
