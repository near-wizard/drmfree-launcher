const STORAGE_KEY = "drmfree-launcher:multiplayer-needs-platform";

// A local, per-game "heads up" a player can attach to any card: the
// base install is DRM-free, but multiplayer still needs the original
// platform's servers/account. Deliberately local-only rather than
// wired into community reporting (decision 0014) — that backend isn't
// even deployed yet (see HUMAN_TODO.md), and this specific nuance is
// useful to the one person who knows it the moment they set it,
// without waiting on crowd-sourced volume. Applying "no dark
// patterns, ever" to this app's own DRM-free badge, not just
// storefronts'.
function gameKey(provider: string, id: string): string {
  return `${provider}:${id}`;
}

function readAll(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only.
  }
}

export function getMultiplayerNeedsPlatform(provider: string, id: string): boolean {
  return readAll()[gameKey(provider, id)] === true;
}

export function setMultiplayerNeedsPlatform(provider: string, id: string, value: boolean): void {
  const all = readAll();
  const key = gameKey(provider, id);
  if (value) {
    all[key] = true;
  } else {
    delete all[key];
  }
  writeAll(all);
}
