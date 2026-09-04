# 0032 — Portability-audit hardening: size confirmation, crash-safe cleanup, real-world verification

**Status:** implemented

## Context

Decision 0031 shipped `copyable_install` automation but flagged one
gap explicitly: no real, large, real-world install was available on
the machine it was built on to verify against — only synthetic
fixtures. This closes that gap and two real problems it surfaced.

## Manual verification against real installs

Ran the `#[ignore]`d `manual_verify_real_install` test (new, gated
behind `DRMFREE_TEST_INSTALL_DIR`/`DRMFREE_TEST_EXE_PATH` env vars so
it never runs in CI or a plain `cargo test`) against two real, large
Steam titles — used purely as real-world data for the copy/launch/
cleanup mechanics, not as a claim either is DRM-free:

- **Risk of Rain** (~92 MB, GameMaker): `Pass` in 438ms. Genuinely
  informative, not just a mechanics check — the copy actually loaded
  game assets, attempted Steam API initialization, failed gracefully,
  and kept running.
- **MECCHA CHAMELEON** (~3.4 GB, Unreal Engine): copy completed
  successfully (confirmed byte-for-byte against the source), and the
  launched copy ran correctly from the copy location. The verification
  *run itself* got interrupted by the session's own tooling before
  reaching its cleanup step (unrelated to the audit code), which
  surfaced a real gap — see below.

## Gap found: cleanup isn't crash-safe

Interrupting the process running an audit *before* its own
`remove_dir_all` runs leaves the copied game's exe still executing
from the temp staging directory, holding file locks that prevent
cleanup indefinitely — confirmed directly: killing the orphaned
`PenguinHotel-Win64-Shipping.exe` (the real shipping binary; the
`PenguinHotel.exe` this was pointed at is a thin launcher stub that
spawns it) was required before `Remove-Item` could succeed. In
production this would need the whole Tauri app process to die
mid-audit, not merely be interrupted — a real but narrow window,
still worth closing since the failure mode (an orphaned multi-
gigabyte directory, indefinitely) is expensive when it happens.

**Fix:** `sweep_stale_staging_dirs`, called once from `lib.rs`'s
`.setup()` hook on a background thread (so a big scan/delete never
delays showing the window). Scans the system temp directory for
anything matching the staging-dir prefix and removes it — best-effort,
skipping anything still locked (it'll be swept on the next launch
instead of failing this one). A directory to scan is a parameter
(`sweep_stale_staging_dirs_in`, with the public no-arg version just
calling it against the real temp dir) specifically so the test doesn't
sweep the *real* system temp directory other concurrently-running
tests' real staging copies also live in — an early version of this
test did exactly that and intermittently deleted a sibling test's
in-progress copy out from under it, caught by running the suite
multiple times, not by inspection.

## Gap found: no warning before a multi-minute copy

`GameCard.tsx`'s "Test copyable install" button previously had no
size-aware confirmation — a click on a large install silently turned
into several minutes of copying with zero warning up front. Confirmed
directly: the MECCHA CHAMELEON copy alone took long enough that a
background shell timeout intervened.

**Fix:** a new `get_install_size` command (wrapping the same `dir_size`
already computed inside `run_portability_audit`, run on a blocking
thread since a large recursive walk shouldn't tie up an async worker)
lets the frontend check size *before* starting. `GameCard.tsx` now
calls it first and, above `PORTABILITY_TEST_CONFIRM_THRESHOLD_BYTES`
(1 GiB — chosen from the Risk of Rain/MECCHA CHAMELEON split: ~92 MB
needed no warning, ~3.4 GB clearly did), shows a `window.confirm` with
the real measured size before proceeding. This is the first
`window.confirm` anywhere in this codebase — checked first, there was
no existing confirmation pattern to reuse (not even for removing a
manual game entry), so this is a deliberate, scoped exception: a
multi-minute, multi-gigabyte disk operation is exactly the kind of
commitment this project's own operating principles call out for a
confirm step, not routine UI state.

A failed size check (the `get_install_size` call itself erroring)
doesn't block the test — it degrades to "no warning shown," since the
free-space check already inside `run_portability_audit` is the real
safety net; the size check was only ever a courtesy heads-up.

## Verification

126 Rust tests (up from 123: `get_install_size`, the merged
`has_outbound_connection` test below, `sweep_stale_staging_dirs_in`),
clippy clean, both new/changed tests confirmed stable across 5
repeated runs at cargo's default parallelism (not just once). 239
frontend tests, including new coverage for `formatBytes`,
`getInstallSize`, and all three confirm-dialog branches (declines,
confirms, skipped entirely below the threshold).

**Unrelated flake also fixed while re-running the suite repeatedly to
verify the above**: `axis_test.rs`'s two `has_outbound_connection`
tests (added in decision 0026) asserted "no connections" and "one
connection" against *the same test binary's own PID* as two separate
`#[test]` functions — since cargo runs tests in parallel by default
and the process's TCP table is genuinely global state, not per-test,
the two could race. Merged into one test that asserts the negative
case, then opens a real connection and asserts the positive case,
guaranteeing the ordering "before" was supposed to mean. Confirmed
stable across 5 repeated runs afterward.

**Also fixed**: `vitest.config.ts` and `eslint.config.js` didn't
exclude `.claude/worktrees/` — running a worktree session (like the
one this pass ran alongside, for Mod Manager) concurrently with a
lint/test run from the main checkout picked up that worktree's own
files too, roughly doubling reported counts and misattributing another
branch's state to this one. Both configs now exclude it explicitly.

## What's on the human

None of this needed elevated privileges or new external dependencies.
