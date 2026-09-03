import type { Game } from "../types/game";

const STORAGE_KEY = "drmfree-launcher:manual-games";
export const MANUAL_PROVIDER = "manual";

// Fills the gap left by decision 0010 (itch.io evaluated, not added as
// a full provider): plenty of people own DRM-free titles from
// storefronts this app has no automated detection for. A manual entry
// extends decision 0002's "if it's installed, it's yours to launch"
// stance to those cases — purely local, never submitted anywhere,
// distinct from the community-reporting flow.
export interface ManualGameEntry {
  id: string;
  name: string;
  /** Direct path to the game's executable — launched via the OS's own
   *  file-open handling (openPath), the same mechanism GOG's own
   *  provider uses server-side, just invoked client-side since manual
   *  entries have no backend GameProvider to route through. */
  exePath: string | null;
  installDir: string | null;
  addedAt: number;
}

function readAll(): ManualGameEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ManualGameEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't crash the app.
  }
}

export function loadManualGames(): ManualGameEntry[] {
  return readAll();
}

export function addManualGame(input: { name: string; exePath: string | null; installDir: string | null }): ManualGameEntry {
  const entry: ManualGameEntry = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    exePath: input.exePath?.trim() || null,
    installDir: input.installDir?.trim() || null,
    addedAt: Date.now(),
  };
  writeAll([...readAll(), entry]);
  return entry;
}

export function removeManualGame(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

// Self-reported by the player, not a project maintainer's own review —
// a looser bar than decision 0008's manual_review doc comment
// describes, but it's the only self-attested method the schema has,
// and this entry never leaves localStorage/gets submitted anywhere, so
// there's no downstream trust system (community consensus, etc.) that
// could conflate it with a maintainer-verified claim.
export function manualEntryToGame(entry: ManualGameEntry): Game {
  return {
    id: entry.id,
    name: entry.name,
    provider: MANUAL_PROVIDER,
    install_dir: entry.installDir,
    exe_path: entry.exePath,
    drm: {
      status: "drm-free",
      source: "self-reported",
      method: "manual_review",
      verified_on: new Date(entry.addedAt).toISOString().slice(0, 10),
    },
  };
}
