# DRM-Free Launcher

An open-core, DRM-free-friendly game launcher.

- **Library** (Stage 0) — a unified view that detects games installed
  via Steam, GOG, and Epic on your machine and launches them. No
  accounts, no ownership APIs — see "How detection works" below.
- **Store** (Stage 2a, in progress) — a read-only, link-out-only
  browser for GOG's DRM-free catalog. No accounts, no payment or
  fulfillment in the app; purchases happen on gog.com. See
  [`docs/decisions/0001-open-core-split.md`](docs/decisions/0001-open-core-split.md)
  and [`docs/decisions/0005-drm-free-only-catalog.md`](docs/decisions/0005-drm-free-only-catalog.md)
  for why the Store is scoped this way.

## Download

Prebuilt installers (Windows MSI/NSIS, macOS, Linux) are published on
the [Releases page](https://github.com/near-wizard/drmfree-launcher/releases)
via `.github/workflows/release.yml`, built from source on tag push. No
auto-updater yet — check the Releases page for new versions.

## How detection works

Each storefront is a `GameProvider` (`src-tauri/src/providers/`). A
provider only ever reads local install manifests/registry keys already
on disk — it never calls a storefront's web API to ask what you own.
Launching hands off to the OS/provider's own mechanism:

- **Steam** — reads `appmanifest_*.acf` files in each Steam library,
  launches via the `steam://rungameid/<appid>` protocol handler.
- **GOG** — reads the `GOG.com\Games` registry keys (Windows only for
  now — GOG has no standard install location on Linux/macOS), then
  runs the installed executable directly. GOG titles are DRM-free, so
  there's no Galaxy handoff and Galaxy doesn't need to be installed.
- **Epic** — reads `.item` manifest files under the Epic Games
  Launcher's `Data/Manifests` directory (Windows/macOS — Epic has no
  native Linux client), launches via the
  `com.epicgames.launcher://apps/<AppName>?action=launch` protocol
  handler.

Adding a new provider means implementing the `GameProvider` trait —
nothing in the core app or UI is storefront-specific.

## Development

```sh
npm install
npm run tauri dev
```

```sh
npm run lint    # ESLint (frontend)
npm run build   # tsc + vite build
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Contributing

Open to contributions — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
for dev setup, how to add a new storefront provider, and PR
expectations. Also see the [`docs/CODE_OF_CONDUCT.md`](docs/CODE_OF_CONDUCT.md)
and [`docs/roadmap.md`](docs/roadmap.md) / [`docs/decisions/`](docs/decisions/)
for where the project's headed and why past calls were made.

## License

MIT — see [`LICENSE`](LICENSE) and [`docs/decisions/0004-license.md`](docs/decisions/0004-license.md) for the reasoning.
