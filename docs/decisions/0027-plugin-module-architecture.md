# 0027 — Plugin module architecture for opt-in features

**Status:** exploring, not decided — no code changes yet. Follow-up to
0026: the user's steer was that mod support (and anything like it) should
be **opt-in only** and shaped as a **pluggable module**, not something
baked into the base app. This explores what "plugin" can actually mean in
this stack and proposes a concrete architecture, using mods as the
motivating example rather than the only consumer.

## The constraint that shapes everything below

This is a Tauri app: one compiled native binary (Rust) plus one bundled
webview (React, built by Vite into `dist/`). Tauri has no supported
mechanism for loading arbitrary third-party *native* code into a running
app — no stable plugin ABI, no safe dynamic-library loading story, and
doing it anyway (raw `dlopen`/`LoadLibrary` of a third-party `.dll`/`.so`)
would mean giving unreviewed code the same process trust as the launcher
itself, which also breaks the code-signing/notarization guarantees the
release pipeline already depends on (`.github/workflows/release.yml`,
decision 0015's auto-updater). So "plugin" here cannot mean "download and
run someone else's compiled Rust." Whatever this looks like has to get
its opt-in, pulled-in-separately property some other way.

Two things *are* already load-bearing for a real answer:

- **Tauri v2's capabilities/ACL system** (`src-tauri/capabilities/*.json`)
  already scopes exactly which commands a given *window* may invoke —
  `capabilities/default.json` today grants the main window
  `core:default`, `opener:default`, `updater:default`, `process:default`
  and nothing else. This is a real permission boundary Tauri enforces,
  not a hand-rolled one — and it's per-window, which means a second
  window can be handed a strictly smaller capability set than the main
  one.
- **The `option_env!`-gated dormant-feature pattern** already used three
  times (community API URL — decision 0014, affiliate tag — decision
  0011/0017, PostHog key — decision 0012): code ships in the binary,
  compiled and auditable, but does nothing until something explicit turns
  it on, and degrades to a silent no-op otherwise. Opt-in via a runtime
  toggle rather than presence/absence of code is already this project's
  house style.

## The core design decision: plugins don't get raw capability, they get vetted primitives

The dangerous part of mod support was never "there's an extra tab in the
UI" — it's "the launcher fetches a third-party file and writes it
somewhere a game will execute it" (0026's central point). If a "plugin"
system's answer to that is *third-party code gets to do that write
itself*, sandboxing the plugin's UI layer accomplishes nothing — the
dangerous action just moved into whatever's inside the sandbox's request
handler. So the split has to be:

- **Core app owns every action with real-world side effects** — writing
  a file, extracting an archive, launching a process, hitting the
  network. These are implemented once, in this repo, with the safety
  rules 0026 already specified (confirm-before-write, zip-slip-safe
  extraction, no auto-executing bundled installers, checksum
  verification). A "mod install" Tauri command is exactly as
  security-reviewed as `launch_game` is today — it's core code, just
  code that's off by default.
- **A plugin is UI plus orchestration** — it decides *what* to show and
  *when* to call a primitive, but the set of primitives it can call is
  fixed by its capability grant, not by what the plugin's own code
  contains. A malicious or buggy plugin can call the wrong primitive at
  the wrong time; it cannot invent a new one.

This means "plugin" in this app is a **narrower, safer thing** than a
browser extension or a VS Code extension — closer to a permissions-gated
UI panel than to arbitrary executable code. That's a deliberate
trade-off: less powerful, but the opt-in promise (worthless-by-default
until a person turns it on) stays true even for a plugin nobody at this
project reviewed.

## Proposed shape

### A plugin is a separate Tauri child window, not a tab in the main one

Rendering third-party UI inside the main window's webview means it shares
that window's `invoke` bridge and, by extension, every capability
`capabilities/default.json` grants — there's no way to hand a chunk of
DOM inside the same window a smaller permission set than the window
itself has. A plugin instead opens as its **own Tauri window**, each with
its own `capabilities/<plugin-id>.json` naming only the commands that
plugin needs (e.g. a mods plugin gets `mods:list_installed`,
`mods:install_from_archive`, `mods:toggle` — nothing from `providers::`,
nothing from `store::`, no `process:default`). This reuses Tauri's real
ACL enforcement instead of a hand-rolled JS-side check a compromised
plugin could just skip.

### A plugin package is a manifest plus a static web bundle — no native code, ever

```jsonc
// plugin.json
{
  "id": "mods",
  "name": "Mod Manager",
  "version": "0.1.0",
  "minLauncherVersion": "0.4.0",
  "capabilities": ["mods:list_installed", "mods:install_from_archive", "mods:toggle"],
  "entry": "index.html",
  "sha256": "…",
  "publisher": "drmfree-launcher-core"
}
```

`entry` is a static HTML/JS/CSS bundle (same build tooling the main app
already uses — Vite output), loaded into the plugin's own window. No
compiled code, no native dependency — this is what actually makes a
plugin something the app can fetch and run without a new app release,
and it's why "no native plugin loading" above isn't a dead end: the parts
worth making pluggable (UI, orchestration, which mod source to talk to)
never needed to be native in the first place.

### Two ways a plugin gets onto the machine, and why they matter differently

- **Bundled-but-dormant.** The plugin's web bundle ships inside the main
  app's own build (in `dist/`), exactly like every other page today, but
  its window is never opened and it's absent from the app menu unless
  the user turns it on in a new Settings → Plugins panel. This is the
  `option_env!` pattern's UI-visible cousin: zero new download/supply-
  chain surface (it's reviewed in this repo, same PR process as
  everything else), fully opt-in, and *the entire realistic answer for
  a first-party plugin like Mod Manager*. Recommended starting point.
- **Fetched-on-enable.** The plugin bundle is *not* in the app download
  at all; enabling it fetches `plugin.json` + the bundle from a registry
  (the closed `drmfree-community`-shaped backend 0026 already flagged
  for mod-catalog curation is a natural home), verifies the `sha256`
  before ever loading it into a window, and caches it locally. This is
  what "pulled in separately" means in the fullest sense — a plugin that
  isn't part of the app's own release process, doesn't inflate the
  base install size, and can update independently. It's also a real
  supply-chain question the moment a publisher isn't "this project
  itself": even sandboxed to a narrow capability set, a plugin can still
  mislead a user into approving a harmful action within that set (e.g. a
  "Mods" plugin that points 1-click install at a malicious archive). So
  this mode should launch gated to `publisher` values this project
  itself controls, with a real per-publisher trust/signing story as a
  precondition for ever opening it to outside plugin authors — not
  something to wave through on the strength of the sandbox alone.

### Every plugin capability is opt-in twice over

1. The plugin itself is disabled by default (Settings → Plugins, nothing
   pre-enabled) — satisfies the direct ask.
2. Enabling a plugin shows exactly which capabilities it's requesting
   (reusing the `capabilities` array in its manifest) before its window
   ever opens — the same "show, then confirm" principle 0026 already
   specified for mod installs, applied one level up to the plugin grant
   itself.

## Where "Mods" lands in this shape

Mod Manager becomes the first bundled-but-dormant plugin:

- Core app gains `mods::list_installed`, `mods::toggle`,
  `mods::install_from_archive` (Stage A/B from 0026) as real, reviewed
  Tauri commands — present in the binary, not registered in
  `capabilities/default.json`, so the main window can't call them
  either.
- A new `plugins/mods/` web bundle (its own small React tree, built
  alongside the main app) is the actual mod-browsing/enable/reorder UI,
  running in its own window with a `capabilities/mods.json` that grants
  only the three commands above.
- Settings gets a "Plugins" section with Mod Manager as the only entry
  initially, off by default, one click to open its window once enabled.
- The community catalog piece of 0026 (Stage C) becomes a second,
  independent opt-in inside the *plugin's own* UI, not a second
  top-level toggle — installing the Mod Manager plugin doesn't imply
  trusting a community catalog; browsing that catalog is a further,
  separate opt-in the plugin's own UI asks for.

## What this gets right, and what it doesn't solve

Gets right: mods (and any future optional feature) can be fully absent
from a user's day-to-day app until they deliberately turn it on, without
that feature's code ever running with more trust than a narrowly-scoped
window; the base app stays exactly as auditable as it is today, since a
bundled-but-dormant plugin is still just code in this repo.

Doesn't solve: true third-party plugin authorship. The moment a plugin's
`publisher` isn't this project, the sandbox only bounds *what* a plugin
can do, not whether a user should trust *why* it's doing it — that needs
a signing/review pipeline this decision deliberately doesn't design yet,
because there's no concrete second publisher asking for it. Treat
fetched-on-enable, first-party-only plugins as the actual near-term
target; open authorship is a separate, later decision with its own
threat model.

## What this decision does NOT resolve

- The actual `mods::*` command implementations — still gated on 0026's
  open phasing question (which of A/B/C to build first).
- Whether the plugin registry (for fetched-on-enable) is a new service
  or folded into `drmfree-community` — deferred same as 0026 deferred
  the catalog's home.
- A real signing/publisher-trust model for any plugin not authored by
  this project — explicitly out of scope until first-party plugins
  (Mod Manager) exist and this pattern has actually been exercised once.
