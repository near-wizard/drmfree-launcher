# 0026 — Mod support: exploration

**Status:** exploring, not decided — no code changes yet. This records the
landscape and a recommended path so the actual scope decision can be made
deliberately, the same way 0013 separated "structure" from "which sources"
before building any.

## The ask

Three things got bundled together in the request and they carry very
different risk profiles, so the first job here is pulling them apart:

1. **Mod support** — the launcher can see, enable/disable, and order mods
   for a game it already manages.
2. **Community mods** — a catalog of mods contributed by the community,
   discoverable in-app.
3. **1-click install** — pick a mod, launcher fetches it and puts it where
   the game expects it, no manual unzip-into-folder.

(1) is a pure local-scan feature, same shape as decision 0002. (2) and (3)
together are what actually make this hard — they turn the launcher from
"observes files that already exist" into "fetches and runs third-party
binaries it chose on the user's behalf," which is a materially different
trust boundary than anything shipped so far.

## Prior art, briefly

- **Steam Workshop** — hosting + install baked into a platform the game
  ships on; not a model available to us (we're not the storefront).
- **Nexus Mods (+ Vortex)** — the closest real analogue: a community mod
  host with an API, and a companion app that does 1-click install via a
  custom `nxm://` protocol handler. Rehosting Nexus files elsewhere is
  against their terms — the API is the sanctioned way to fetch, not a
  general "scrape and mirror" license.
- **ModDB / itch.io mod pages** — plain file hosting, no install
  automation; a link-out model, similar to how this app already treats
  itch.io for the Store tab (decision 0010).
- **Mod Organizer 2** — install automation with zero hosting/community
  layer at all: local-only, points at archives the user already has.

Every real precedent separates "who hosts the files" from "who automates
install" — worth keeping that split explicit below instead of collapsing
it into one feature.

## Why this is a bigger trust jump than anything shipped so far

Everything the launcher does today with third-party data is read-only or
opt-in-and-inert:

- Providers (`providers/`) read installed-game metadata and hand off to
  the OS/storefront's own launch mechanism (decision 0002) — never
  executes a file the launcher fetched itself.
- The Store tab (`store/`) browses GOG's public catalog and link-outs to
  GOG's own checkout — no file transfer through us at all.
- Community DRM reports (decision 0014) are text (status + a 280-char
  note) served back as aggregate counts — worst case is bad data, not
  bad code.

A mod, by contrast, is very often a native DLL or executable that gets
loaded *into the game process* (ASI loaders, native plugin DLLs) or run
with elevated trust the game itself grants it. "1-click install" means
the launcher fetches a binary from a third party and places it somewhere
that will execute with the game's privileges the next time it launches.
That's real code execution risk, not a data-quality risk — the failure
mode isn't "a wrong badge," it's "a compromised game process." Any design
here has to treat that as the central constraint, not an edge case to
handle later.

## Where hosting/curation fits the existing open-core split

Decision 0001/0011 already drew this line once for a different feature:
local-scan logic and UI stay open (this repo); anything where the
moderation/abuse posture benefits from not being fully public goes to a
closed backend (`drmfree-community` is the existing instance of that
pattern, for DRM-status reports). Mod curation is the same shape, with
higher stakes — a public, fully-documented "here's exactly how our
malware review works" is a roadmap for getting malware past it. So: if a
curated catalog happens, its curation logic belongs in a closed backend
by the same reasoning as 0011, not in this repo.

## Options, roughly in order of how much new trust surface they open

### A. Local mod management only — no fetching, no catalog
Detect known per-game mod directories (e.g. a Skyrim `Data/` folder, a
game with an obvious mods convention), list what's already there, and
let the user enable/disable/reorder. Zero new trust surface: the
launcher never fetches or executes anything it didn't already trust the
user to have put there themselves. Same "local scan, not an API" posture
as decision 0002. Real utility on its own (most mod pain is load-order
and enable/disable, not the download step) and ships with no hosting/
legal/security decision pending.

### B. 1-click install from a URL/archive the user already has
User pastes a mod page's direct download link, or drags in an archive
they downloaded themselves; the launcher fetches (if a URL), extracts,
and places files per that game's mod convention, plus zip-slip-safe
extraction and a confirmation step showing exactly what will be written
where. Still no catalog and no rehosting — we're not choosing what mods
exist, only automating the "unzip into the right folder" step the user
would've done by hand. This is the first stage that fetches a file the
launcher didn't have a pre-existing trust relationship with, so it's
also the first stage that needs the safety measures in the section
below, even though there's no curation question yet.

### C. Curated catalog, metadata only — no rehosting
A community-catalog service (closed backend, `drmfree-community`-shaped)
indexes mods per game: title, description, screenshots, the *origin*
download URL (Nexus/ModDB/itch.io — wherever the modder actually
published it), and a checksum submitted by whoever curates the entry.
"1-click install" fetches from the origin host at install time, not from
us — we never rehost the binary, which sidesteps both the Nexus-ToS
rehosting problem and a chunk of the DMCA exposure of actually storing
copyrighted-adjacent content ourselves. The curation step (who's allowed
to add a catalog entry, how a bad entry gets pulled) is exactly the kind
of moderation-posture-benefits-from-not-being-public logic decision 0011
already put in a closed backend for DRM reports.

### D. Community file hosting — actual uploads to our infrastructure
Users upload mod files directly to us; we store and serve them. This is
the only option that gives real independence from any third-party host
(no dependency on Nexus's API staying available/free), but it's a
different project: virus/malware scanning pipeline, storage costs that
scale with usage instead of being roughly flat, and direct DMCA
takedown obligations as the actual host of the files (vs. C, where we'd
point at someone else's takedown-compliant host). Given the team size
here, this is the option most likely to be a mistake to build before
there's real signal C isn't enough — flagging it, not recommending it.

## Safety measures that apply from option B onward

- **Show, then confirm.** Before writing anything, show the user exactly
  which files go where — no silent install.
- **Zip-slip-safe extraction.** Reject any archive entry whose resolved
  path escapes the target mod directory (standard archive-extraction
  vulnerability class — trivial to get wrong by using a naive `join`).
- **No auto-execution.** The launcher extracts files; it never runs an
  installer `.exe` bundled in a mod archive on the user's behalf. If a
  mod ships as a self-installing exe rather than a drop-in archive, that
  stays a manual "open it yourself" case, at least initially — running
  an arbitrary third-party installer with no sandboxing is a strictly
  worse trust jump than extracting files.
- **Checksum verification where we have one to check against** (option
  C+, once entries carry a curator-submitted checksum) — mismatch blocks
  install by default rather than warning-and-continuing.
- **Explicit "we do not scan mod files for malware" disclosure** the
  moment any fetched mod isn't 100% user-supplied (option C+) — false
  confidence here is worse than no claim at all.

## Suggested phasing

A → B → C, each shippable and useful on its own, each a strictly smaller
step than jumping straight to C or D:

- **A** has no open question left to resolve — it's buildable now,
  whenever there's room for it, independent of anything below.
- **B** needs one product decision: which games get a known mod-folder
  convention first (Bethesda-style `Data/` overlay games are the
  easiest starting shape — flat file-drop, no load-order plugin system
  required for a v1).
- **C** needs the open-core boundary call made explicitly (new decision,
  mirroring 0011) plus a real answer to "who curates," before any code.
- **D** is explicitly not recommended without a specific reason B/C
  turned out to be insufficient.

## What this decision does NOT resolve

- Which stage (if any beyond A) to actually build, and when.
- Per-game mod-directory conventions beyond the general shape above —
  that's per-provider research, not a one-time architectural call.
- Whether a curated catalog (C) lives in `drmfree-community` itself or a
  new sibling service — deferred until C is actually greenlit.
