# DRM-Free Launcher

An open-core, DRM-free-friendly game launcher. Stage 0 (current):
a unified library view that detects games installed via Steam and GOG
on your machine and launches them — no accounts, no marketplace, no
ownership APIs.

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

Adding a new provider means implementing the `GameProvider` trait —
nothing in the core app or UI is Steam/GOG-specific.

## Development

```sh
npm install
npm run tauri dev
```

## Contributing

Open to contributions — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
for dev setup, how to add a new storefront provider, and PR
expectations. Also see the [`docs/CODE_OF_CONDUCT.md`](docs/CODE_OF_CONDUCT.md)
and [`docs/roadmap.md`](docs/roadmap.md) / [`docs/decisions/`](docs/decisions/)
for where the project's headed and why past calls were made.

## License

MIT — see [`LICENSE`](LICENSE) and [`docs/decisions/0004-license.md`](docs/decisions/0004-license.md) for the reasoning.
