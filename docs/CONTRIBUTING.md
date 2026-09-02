# Contributing

DRM-Free Launcher is open to contributions. This covers dev setup,
how to add a new storefront provider, code style, and what to expect
from a PR.

## Principles worth reading first

Before writing code, skim `docs/roadmap.md` and `docs/decisions/`.
Two decisions constrain what kinds of PRs will be accepted:

- **Local-scan detection only** (`0002-local-scan-not-ownership-api.md`)
  — a provider reads local install manifests/registry keys and hands
  off launch to a native protocol/URI handler or direct executable. It
  never calls a storefront's web API to read a user's owned-games
  list. PRs that add an OAuth/API-based "ownership" detection path
  will be rejected regardless of how it's implemented.
- **No blended launcher/marketplace UX** (`0001-open-core-split.md`) —
  the launcher stays a local library aggregator. Marketplace-shaped
  features (checkout, accounts, catalog browsing beyond a labeled
  "Buy on X" link-out) belong in a separate service, not this repo.

## Dev setup

```sh
npm install
npm run tauri dev
```

Requires Rust (stable toolchain) and Node 20+. `cargo check` and
`cargo test` should pass from `src-tauri/` before opening a PR; `npm
run build` should pass from the repo root.

## Adding a new `GameProvider`

Each storefront is one file in `src-tauri/src/providers/` implementing
the `GameProvider` trait (`src-tauri/src/providers/mod.rs`):

```rust
pub trait GameProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn detect_installed_games(&self) -> Vec<Game>;
    fn launch(&self, game: &Game) -> Result<(), String>;
}
```

Look at `steam.rs` (protocol-handler launch) and `gog.rs` (direct exe
launch) as the two existing shapes. Register the new provider in
`all_providers()` in `mod.rs`. Pure parsing/path-resolution logic
should be a free function, not inlined in the trait impl, so it can be
unit tested without touching the real filesystem/registry — see
`extract_quoted_values` in `steam.rs` or `resolve_exe_path` in
`gog.rs` for the pattern.

A provider that can't detect anything on the current OS should return
an empty `Vec`, not an error — a storefront simply not being installed
is a normal outcome.

## Code style

No enforced linter yet; match the surrounding file. Keep comments to
the *why*, not the *what* — see the existing provider files for the
tone this project uses.

## PRs

Small, focused PRs preferred over large ones. Describe what the PR
does and why in the description, not just the diff. If a PR touches
one of the constraints above, expect it to be discussed before merge,
not to just get closed silently.
