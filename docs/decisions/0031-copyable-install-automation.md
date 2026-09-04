# 0031 — Automating `copyable_install` (D1), kept separate from the fast audit

**Status:** implemented

## Context

Decision 0025 flagged `copyable_install` as "technically simpler [than
network-blocking] but costs real disk space and time per test" and
deferred it on that basis alone — unlike the axes decision 0025
actually ruled out, this one has no fundamental blocker: no elevation,
no external data source (unlike `no_publisher_auth_servers`, which
would need a curated publisher-domain list this project doesn't have).
It only needed the cost/UX question answered: how to offer a
potentially slow, disk-heavy test without surprising anyone who just
wanted the fast "Run audit" button.

## What changed

**`src-tauri/src/portability_audit.rs`** (new): `run_portability_audit`
— measures the install directory's size, checks free space at the
system temp directory (`GetDiskFreeSpaceExW`, read-only, no elevation)
with a 10% safety margin, recursively copies the install there,
launches the copy, and reports `Pass`/`Fail` on the same liveness
signal `run_launch_audit` uses. Two real differences from that
function, both because this is a disposable copy rather than the
user's actual install:
- A process still running at the deadline gets **killed** here (vs.
  never-killed for a normal launch) — there's nothing of the user's to
  interrupt, and leaving it running would block cleanup.
- The staging copy is **always** deleted afterward, regardless of the
  test's outcome — a failed cleanup is logged to stderr, not surfaced
  as the command's own failure, since the portability result is
  already known by that point.

Symlinks inside the install are skipped, not followed or recreated —
following one risks copying far more than the install actually
occupies; recreating one loses meaning once relocated under a
different parent directory.

**Kept out of the fast path on purpose.** `runPortabilityAudit`
(`localAxisTests.ts`) is a new, separate function — not folded into
`runFullAudit`. `GameCard.tsx` gets a second, distinctly-labeled
button, "Test copyable install," rendered only when both a real
`exe_path` *and* a real `install_dir` are known, with a title
explicitly warning it may take a while and use extra disk space. The
existing "Run audit" button's cost stays what it's always been — a
few seconds, no meaningful disk use — so adding this doesn't change
what clicking that button commits to.

Errors (most commonly: not enough free space) surface as a plain
inline message next to the button rather than a toast or crash — this
is exactly the kind of expected, actionable failure ("free up some
space, or don't run this on a laptop with a nearly-full drive") that
deserves to stay visible near where it happened, not vanish into a
console log.

## Verification note

The end-to-end Rust test copies `notepad.exe` (present on every
Windows install, same one `icon.rs`'s own tests already rely on being
there) into a synthetic fake "install," runs the real command against
it, and confirms both the launch result and that the staging directory
and process are both gone afterward — verified this leaves no leftover
process or temp directory on the dev machine the change was made on.
No GOG/Humble game happened to be installed there, so this couldn't
also be manually verified against a real, large, real-world install;
recommend a manual smoke test against one before relying on this for
anything beyond the automated coverage.

## What's on the human

Trying this against a real, large game install once one is available —
the automated coverage here is solid on synthetic data, but a
multi-gigabyte real copy (timing, actual disk behavior) hasn't been
observed firsthand.
