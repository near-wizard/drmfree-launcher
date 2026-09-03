const STORAGE_KEY = "drmfree-launcher:gog-match-cache";

export interface GogMatchEntry {
  status: "found" | "not-found";
  storeUrl?: string;
  checkedAt: number;
}

function gameKey(provider: string, id: string): string {
  return `${provider}:${id}`;
}

function readAll(): Record<string, GogMatchEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCachedMatch(provider: string, id: string): GogMatchEntry | undefined {
  return readAll()[gameKey(provider, id)];
}

export function recordMatch(provider: string, id: string, entry: Omit<GogMatchEntry, "checkedAt">): void {
  const all = readAll();
  all[gameKey(provider, id)] = { ...entry, checkedAt: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't break the check.
  }
}

export function clearCachedMatch(provider: string, id: string): void {
  const all = readAll();
  delete all[gameKey(provider, id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort only.
  }
}
