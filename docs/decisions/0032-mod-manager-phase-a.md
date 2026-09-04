# 0032 — Mod Manager Phase A: local mod management

**Status:** implemented.

## Context

Decision 0028 split mod support into three pieces with very different
trust profiles and picked "A — local mod management only" as the one
with no open question left to resolve: "detect known per-game mod
directories... list what's already there, and let the user
enable/disable/reorder. Zero new trust surface." Decisions 0029/0030
built the plugin scaffold this would eventually live in — a separate
Tauri window, `plugins.rs`'s `PLUGINS` registry, an (until now)
placeholder `ModManagerPlugin.tsx`. This decision is the actual Phase
A implementation: real `mods::*` commands, a real UI, and three
specific calls 0028/0029 deliberately left open.

## Call 1: no per-game mod-directory convention database

0028 suggested Bethesda-style `Data/`-overlay games as the easiest
first case, and floated auto-detecting known conventions. This project
has no such database today — nothing here currently knows "Skyrim's
mods go in `<install>/Data`" the way `providers::steam` knows how to
parse a Steam manifest. 0028 itself calls building and maintaining one
"per-provider research, not a one-time architectural call": every
engine, and often every game within an engine, has its own convention,
and getting it wrong (pointing "enable/disable" machinery at the wrong
folder) is worse than not offering the shortcut at all.

So Phase A is **generic and engine-agnostic**: pick one of your
installed games (reusing `list_games`, already provider-agnostic), then
tell the app where that game's mods folder is. No auto-detection
required. The one concession to convenience is `suggest_mod_dirs`: it
checks for three common subfolder names (`Mods`, `mods`, `Data`) under
the game's `install_dir` and offers whichever ones actually exist as
one-click suggestions — never auto-selected, never assumed. This is
explicitly not the start of a convention database; it's three strings
that cost nothing to check and happen to match enough real games to be
worth the click-saving. A real per-engine database, if this ever grows
one, is future work exactly as 0028 scoped it.

## Call 2: the enable/disable and ordering mechanism

**Toggle: rename-suffix (`.disabled`).** Appending/stripping `.disabled`
on a mod's on-disk file or folder name is a real, commonly-used
mechanism — plenty of folder-based mod loaders simply skip any entry
whose name doesn't match what they expect, so a renamed entry becomes
invisible to them without deleting anything. It's not universal (some
loaders enumerate strictly by expected filename/extension and would
choke on an unexpected suffix instead of skipping it), so this is
documented in the UI copy and code comments as "a mechanism," not "the
mechanism." Reversible, visible in a plain file browser, and needs no
mod-format-specific parsing — which matters given Call 1: a generic
tool can't assume it understands what any given mod file's format
means, so it can only manipulate mods the same crude way regardless of
what they are.

**Order: bookkeeping, not enforcement.** `set_mod_order` persists a
list of base (suffix-stripped) names to a dotfile,
`.drmfree-mod-order.json`, written *inside* the mods directory itself
(hidden from `list_mods` the same way `.git`/`.DS_Store` are). It
travels naturally if the whole folder moves and needs nothing kept in
sync elsewhere. But — and the UI says this outright, directly under
the reorder controls — **for a generic, engine-agnostic tool, this
order is not read by the game.** Real load-order enforcement means
writing to an engine-specific file in an engine-specific format (a
`loadorder.txt`, a plugin priority list, whatever that engine actually
reads at startup), which is exactly the per-engine research Call 1
already declined to build. Shipping a reorder UI that implies it
controls load order, when it doesn't, would be a dark pattern by this
project's own standard (0011's "no dark patterns, ever," applied here
to our own feature rather than a storefront's). So Phase A's order is
useful only as "the order I like to see my mod list in" — display
bookkeeping, honestly labeled as such, until a specific engine gets a
real load-order integration in a later phase.

## Call 3: keep this a Window-kind plugin, not downgrade to FeatureFlag

0030 introduced `PluginKind::FeatureFlag` for the audit feature,
reasoning that `run_launch_audit` spawns the exact same exe the
"Launch" button already spawns — no new trust boundary, so a sandboxed
window added IPC overhead without adding a real safety property. Phase
A's actual footprint is genuinely small by that same yardstick: it
reads a directory the user names and renames files inside it — no
network, no execution, no archive handling.

Kept `Window` anyway, for two reasons:

1. **The roadmap, not just today's diff.** Unlike audit (which 0030
   describes as staying exactly as-is going forward), Mod Manager is
   explicitly the plugin 0029 designed the window-plus-capability-file
   shape *for* — decision 0028's options B and C (install-from-URL,
   catalog browsing) are the reason this whole mechanism exists.
   Building Phase A as `FeatureFlag` now and converting to `Window`
   later, whenever B lands, means redoing the window/capability
   plumbing under time pressure from a feature that actually needs it,
   instead of having it already proven out from a lower-stakes
   starting point. Proving the pattern generalizes while the stakes are
   still low is worth the current overhead.
2. **It's not quite the audit precedent even for Phase A alone.**
   Audit's exactly-equivalent argument was "the main window can already
   do this by clicking Launch." Nothing on the main window today
   renames arbitrary files in a directory the user names — this is a
   new *kind* of action (a filesystem write, however constrained),
   even though its risk today is bounded by "only within a folder you
   explicitly pointed at." Keeping it isolated in its own window keeps
   that action contained to one narrow surface rather than folding it
   into the main window's already-large command set, independent of
   whether Tauri's capability system actually enforces that isolation
   today (it doesn't fully — see the next section).

This was a judgment call, not a forced one — the brief for this work
explicitly invited either answer. Recorded here so the reasoning isn't
lost if a future FeatureFlag-vs-Window decision needs precedent.

## The command-ACL gap: known, not fixed here

While building this, it was confirmed (originally surfaced during the
0030 audit-plugin work) that **this project's Tauri capability files
only restrict Tauri's own built-in plugin permissions** — `core:*`,
`opener:*`, `updater:*`, `process:*` — **not this app's own
`#[tauri::command]`s.** Concretely:

- `src-tauri/build.rs` is a bare `tauri_build::build()` — no
  `permissions/` directory, no ACL manifests for app-defined commands.
  Checking the actual build output
  (`target/*/build/tauri-*/out/permissions/`) confirms Tauri only
  auto-generates command-permission scaffolding for its own bundled
  plugins (`app`, `event`, `image`, `menu`, `path`, `window`, etc.) —
  there is no equivalent entry for `list_games`, `launch_game`,
  `mods::list_mods`, or any other command this project defines itself.
- Every command listed in `lib.rs`'s `generate_handler!` is therefore
  callable via `invoke()` from **any** window, main or plugin,
  regardless of what a `capabilities/*.json` file says — the "windows"
  scoping and "permissions" array in `capabilities/plugin-mods.json`
  fence off Tauri's own opener/updater/process, but do nothing to fence
  off `mods::*` from the main window, or `launch_game`/`list_games`
  from the plugin window.
- `capabilities/plugin-mods.json`'s previous description claimed a
  plugin window "only ever gets what its own commands need, never
  anything inherited from the main app" — that was aspirational, not
  actually true for app commands, and has been corrected in this
  change to say so plainly rather than implying a containment property
  the code doesn't have.

**This decision does not fix that gap.** A real fix means turning
`mods` (and every other app command module) into an actual Tauri
*plugin* with its own generated ACL manifest — a `tauri::plugin::Builder`
wrapping these commands, permission TOML files, and a capabilities
migration for every existing command across the whole app, not just
mods. That's a cross-cutting architecture change with real risk of
subtly breaking every other command's reachability if the ACL
semantics are gotten wrong, and it's much bigger than "Phase A of the
mod manager." Scoping it to mods alone wouldn't even achieve real
isolation, since the main window would still need equivalent handling
for its own command set to avoid a regression.

Given that, and given Phase A's actual worst case (a rename confined
to a directory the caller passed in, validated server-side, no
network/execution path at all), the practical choice was: **compensate
at the command layer, document the gap plainly, defer the real fix.**
Concretely:

- `mods::toggle_mod` and `mods::set_mod_order` reject any entry name
  containing a path separator or `..` before touching the filesystem
  (`validate_entry_name` in `src-tauri/src/mods.rs`) — the caller
  cannot walk these commands outside the directory they were given,
  regardless of which window called them.
- `capabilities/plugin-mods.json`'s description was rewritten (see
  above) to state the gap outright instead of the previous, inaccurate
  isolation claim.
- This section is that plain documentation, findable the next time
  this surface actually grows install/fetch capability (decision
  0028's option B) and the gap stops being low-stakes.

## What was built

- `src-tauri/src/mods.rs` — `list_mods`, `toggle_mod`, `set_mod_order`,
  `suggest_mod_dirs`. Registered in `lib.rs`'s `generate_handler!`.
  17 new Rust tests, including a containment regression test pinned
  specifically against the ACL gap above.
- `src/lib/mods.ts` — thin `invoke()` wrappers plus a small
  localStorage-backed "which folder did I last pick for this game"
  cache (`getChosenModsDir`/`setChosenModsDir`), same pattern as
  `lib/manualGames.ts`/`lib/multiplayerFlag.ts`. This is UI convenience
  only — the actual order data lives in the mods directory's own
  sidecar file, not here.
- `src/plugins/mods/ModManagerPlugin.tsx` — the real plugin-window UI:
  game picker, mods-folder input with suggestion buttons, an
  enable/disable checkbox and up/down reorder buttons per entry, and
  the "this order is bookkeeping only" disclosure from Call 2.
- `src-tauri/capabilities/plugin-mods.json` — description corrected per
  the ACL section above; permissions unchanged (`core:default` only —
  still narrower than the main window's opener/updater/process for
  Tauri's own plugin surface, even though it doesn't scope `mods::*`).
- `src-tauri/src/plugins.rs` — the `mods` entry's description updated
  to reflect that Phase A commands now exist (previously said "a
  scaffold today — no... commands exist yet").

## What's explicitly deferred

- Options B (install-from-URL/archive) and C (curated catalog) from
  0028 — not started, not designed further here.
- Any per-game/per-engine mod-directory convention database beyond the
  three-name suggestion list — future work per 0028.
- Real load-order enforcement for any specific engine — Phase A's
  order is display-only, honestly labeled.
- The command-ACL gap — documented above, not fixed. Becomes a real
  precondition once option B gives a plugin window the ability to
  fetch/write from an untrusted source, not just rename what's already
  there.

## Verification

142 Rust tests (17 new in `mods.rs`), 250 frontend tests (18 new:
`lib/mods.test.ts`, `plugins/mods/ModManagerPlugin.test.tsx`), clippy,
tsc, lint, and build all clean.

## What's on the human

- Try Phase A against a real mod folder for a game you actually own —
  the suggestion list (`Mods`/`mods`/`Data`) and the `.disabled` rename
  convention are both informed guesses, not verified against a broad
  set of real mod loaders. If a loader you use *doesn't* tolerate a
  `.disabled`-suffixed file being left in place, that's worth knowing
  before this goes further.
- Decide whether the command-ACL gap needs fixing before option B
  (fetch/install) is built, or whether it's acceptable to ship B first
  and fix ACL alongside it — this decision only asserts it should be
  fixed *before* a plugin window gets real network/write-from-untrusted
  capability, not the exact timing relative to B's own design work.
- Review the Window-vs-FeatureFlag call in Call 3 above — it's a
  defensible judgment call, not a forced conclusion, and the brief for
  this work explicitly left it open.
