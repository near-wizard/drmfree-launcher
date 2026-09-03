const STORAGE_KEY = "drmfree-launcher:last-played";

function gameKey(provider: string, id: string): string {
  return `${provider}:${id}`;
}

function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordLaunch(provider: string, id: string): void {
  const all = readAll();
  all[gameKey(provider, id)] = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't break launching.
  }
}

export function lastPlayedAt(provider: string, id: string): number | undefined {
  return readAll()[gameKey(provider, id)];
}

export function loadLastPlayedMap(): Record<string, number> {
  return readAll();
}
