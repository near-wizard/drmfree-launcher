# 0030 — Moving the automated audit behind the plugin model

**Status:** implemented.

## The ask

Move the "Run audit" feature (decisions 0025/0026 — `structural_axes`,
`run_launch_audit`, the "your machine:" pips row and Auto-submit
checkbox on each `GameCard`) behind the opt-in plugin model 0029 built
for Mod Manager, so it's off by default instead of always present on
every card.

## Why this isn't a second Mod Manager

0029's plugin shape (a separate Tauri window, its own narrower
`capabilities/plugin-<id>.json`) exists to answer one specific problem:
Mods needed to fetch and place a third-party file somewhere a game
would execute it — a real *new* trust boundary, so the plugin only ever
gets a vetted core-owned primitive to call, never raw capability
(0029's central point).

Audit doesn't have that problem. `run_launch_audit` spawns the game's
own executable — the exact same exe the "Launch" button on that same
`GameCard` already spawns, with the same trust the user already extends
every time they play the game. Gating it behind a sandboxed window with
a smaller capability grant wouldn't be closing a gap: the main window
could already do everything `run_launch_audit` does, just by launching
the game normally. There's no new capability to contain here, so 0029's
window-plus-capability-file mechanism would add process/IPC overhead
without adding a real safety property.

The actual obstacle is different: **audit's whole value is being
embedded per-game, inline, next to the badge it's informing.** Decision
0025 built it that way on purpose — click "Run audit," see the "your
machine:" pips fill in on the same card, right under the community
consensus row it's meant to be compared against. A Mods-style separate
window would mean leaving the Library, re-finding the same game in a
second UI with none of that surrounding context, running the audit
there, then mentally reconciling the result back onto the original
card. That's a real UX regression, not a neutral packaging change — so
this can't be a drop-in application of 0029's shape.

## Proposed shape: a feature-flag plugin, not a window plugin

Generalize the plugin registry (`src-tauri/src/plugins.rs`) to admit a
second, lighter kind alongside 0029's window plugin:

- **Window plugin** (what Mod Manager already is): its own Tauri
  window, its own `capabilities/plugin-<id>.json`, because it's
  introducing a real new trust boundary that needs containing.
- **Feature-flag plugin** (new): no window, no new capabilities file —
  the underlying commands (`structural_axes`, `run_launch_audit`) stay
  registered and reachable from the main window exactly as they are
  today, because there's no boundary here worth adding. Enabling this
  kind of plugin only flips whether the *UI* for it renders at all.
  This is opt-in for declutter/complexity reasons — most users may
  never care about DRM-axis auditing — not for containment reasons.

```rust
enum PluginKind {
    Window { label: &'static str },
    FeatureFlag,
}

struct PluginDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    kind: PluginKind,
}

const PLUGINS: &[PluginDef] = &[
    PluginDef { id: "mods", name: "Mod Manager", kind: PluginKind::Window { label: "plugin-mods" }, .. },
    PluginDef { id: "audit", name: "Automated Freedom-Test Audit", kind: PluginKind::FeatureFlag, .. },
];
```

`list_plugins` gains a `has_window: bool` field (derived from `kind`) so
`PluginsView.tsx` knows not to show an "Open" button for a feature-flag
plugin — there's nowhere for it to open. Its card instead gets a short
line explaining where it actually shows up: "Appears inline on each
game card in your Library."

`open_plugin_window` keeps working unchanged for `Window`-kind plugins
and returns an error for a `FeatureFlag`-kind id (there's no window to
open) — the frontend never calls it for one, since the toggle alone is
the whole interaction.

## What actually moved

- `src-tauri/src/plugins.rs`: `PluginDef` gained a `kind: PluginKind`
  field (`Window { window_label }` | `FeatureFlag`) replacing the old
  bare `window_label`; the `audit` entry was added as
  `PluginKind::FeatureFlag`. `list_plugins` gained `has_window: bool`,
  derived from `kind`. `open_plugin_window` now returns an `Err` for a
  `FeatureFlag`-kind id instead of assuming every registered plugin has
  a window. No change to `axis_test.rs`, `portability_audit.rs` (added
  after this decision was first written, for `copyable_install` —
  folded into the same gate below), or `capabilities/default.json` —
  those commands are not gated by this change, only their UI's
  visibility is.
- `src/lib/plugins.ts`: `PluginInfo` gained `has_window`. Also gained
  `onPluginToggled`/a `CustomEvent` dispatch from `setPluginEnabled` —
  not anticipated when this decision was first written, but turned out
  to be necessary: every tab in this app stays mounted simultaneously
  (`App.tsx` uses `hidden`, not conditional rendering, to switch tabs),
  so an already-mounted `GameCard` in the Library tab wouldn't
  otherwise notice the Plugins tab toggling `audit` on/off without a
  reload. The browser's native `storage` event doesn't help here either
  — it only fires in *other* documents/windows, never the one that made
  the write.
- `src/components/GameCard.tsx`: the "your machine:" pips row, the "Run
  audit"/"Auto-submit results" row, the "Test copyable install" row,
  and the `runStructuralAxes` mount-time effect are all wrapped in
  `auditPluginEnabled &&` — a piece of local state seeded from
  `isPluginEnabled("audit")` and kept live via `onPluginToggled`. Off
  by default, same as every plugin under 0029.
- `src/components/PluginsView.tsx`: renders an "Open" button only when
  `has_window` is true; shows "Appears inline on each game card in your
  Library." otherwise.
- No change to `localAxisTests.ts`, `axis_test.rs`,
  `portability_audit.rs`, or any `drmfree-community` submission path —
  none of that carries new risk or new packaging, only the entry
  point's visibility changes.

## What this decision deliberately does not do

This does **not** shrink the compiled app or remove the audit code from
default builds — `structural_axes`/`run_launch_audit` stay in the
binary exactly as now, reachable the moment the flag is flipped on, no
new download or rebuild involved (matching this app's existing
`option_env!`-gated dormant-feature pattern, e.g. decision 0014's
community reporting). A build-time removal (for, say, a minimal/embedded
build that never wants this code compiled in at all) is a distinct,
not-yet-requested axis of "opt-in" — a Cargo feature flag, not this
plugin mechanism — and isn't in scope here.

## Why this generalization is worth making now

Without it, 0029's registry only has one shape to offer future opt-in
features: "spin up a whole separate window." That's right for anything
that's actually introducing new capability (a second Mods-like feature,
say), but wrong for anything whose only ask is "stop showing this by
default" on something already exactly as trusted as the rest of the
main window. Splitting `PluginKind` now, while there are exactly two
concrete cases to design against, is cheaper than retrofitting a single
Window-shaped registry once a third feature-flag-shaped plugin shows up
and the assumption "every plugin has a window" turns out to be baked in
several places.

## What this decision does NOT resolve

- Whether any *other* existing feature should retroactively become a
  feature-flag plugin (e.g. the Freedom Dashboard, wishlist
  cross-reference) — out of scope; this decision is audit-specific,
  triggered by a direct ask about audit only.

## Verification

125 Rust tests (4 in `plugins.rs`, including one asserting `audit`'s
`has_window` is `false` and one confirming `every_window_plugin_def`
still holds for `mods`), 232 frontend tests (new coverage: audit UI
absent by default, appears live on toggle-on with no remount required,
disappears again on toggle-off; `PluginsView` renders no Open button
and the inline-location line for a feature-flag plugin), clippy, tsc,
lint, and build all clean.
