# 0023 — Epic cover art: exe-icon fallback, not a reverse-engineered API call

**Status:** implemented

## Context

Steam and GOG both have working cover-art lookups (a CDN-guess +
fallback for Steam, an exact product-ID API call for GOG). Epic has
neither — its real catalog metadata lives behind
`catalog-public-service-prod06.ol.epicgames.com`, which returns
`401 authentication_failed` unauthenticated (confirmed directly).
Getting past that requires an OAuth client-credentials grant using the
Epic Games Launcher's own embedded client id/secret — a pair not
issued to this app, extracted from Epic's own client, and used by
several unofficial community tools (Legendary, Heroic) for exactly
this kind of catalog lookup.

## Decision

Not doing that. This project already draws a hard line against calling
a storefront's own API to ask things it isn't meant to answer for a
third party (decision 0002's local-scan principle) — leaning on
reverse-engineered launcher credentials to fetch metadata is the same
kind of dependency this app has otherwise avoided: fragile (Epic can
rotate the secret with no notice, silently breaking every user's cover
art at once) and not really "ours" to use.

Instead: Epic manifests already carry `InstallLocation` and
`LaunchExecutable` — enough to point at the real installed exe.
`get_exe_icon` (`src-tauri/src/icon.rs`) extracts that exe's own
Windows shell icon (`SHGetFileInfoW` + `GetIconInfo` + `GetDIBits`,
re-encoded as PNG, base64 data URI) and `GameCard.tsx` uses it as the
last fallback in the cover-art chain, after the Steam/GOG lookups come
up empty. Smaller and less polished than real store art, but a real
image beats a plain placeholder letter, and it costs nothing but a
local file read — no network call, no API key, nothing that can be
revoked.

`Game` gained a new `icon_source: Option<String>` field for this — a
real filesystem path, kept deliberately separate from `exe_path`
(which for Epic is already spoken for by the protocol-handler
composite id, not a real path). Only Epic and Humble populate it;
Humble has no cover-art API at all today, so this is its only source
of cover art too, not just a fallback.

## What's on the human

Nothing new — purely local, reads a file already on the user's disk.
