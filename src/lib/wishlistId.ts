// SteamID64 is always a 17-digit number — a stable, unambiguous shape
// to validate against regardless of where the user copied it from.
const STEAMID64_PATTERN = /^\d{17}$/;
const PROFILE_URL_PATTERN = /\/profiles\/(\d{17})/;

// Accepts either a bare SteamID64 or a full profile URL containing one
// (steamcommunity.com/profiles/<id>/...) — but deliberately not a
// vanity /id/<name> URL, since resolving that to a SteamID64 needs a
// Steam Web API key this project doesn't have one of (see
// decisions/0014, 0015 for the existing "only bake in a key we
// actually own" pattern this follows).
export function parseSteamId64(raw: string): string | null {
  const trimmed = raw.trim();
  if (STEAMID64_PATTERN.test(trimmed)) return trimmed;
  const match = trimmed.match(PROFILE_URL_PATTERN);
  return match ? match[1] : null;
}

const STORAGE_KEY = "drmfree-launcher:wishlist-steam-id";

// Remembering the last-used id is a convenience, not an identity
// system — same spirit as lastTab.ts, purely local, never sent
// anywhere except back to Steam's own public wishlist endpoint the
// user explicitly triggers.
export function loadSavedSteamId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSteamId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't block using the feature.
  }
}
