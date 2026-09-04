import { invoke } from "@tauri-apps/api/core";

// Thin call-throughs to the mods:: Tauri commands (src-tauri/src/mods.rs).
// Phase A only (decision 0028 option A, this shape decided in decision
// 0032): local list/toggle/order of files already on disk. Nothing here
// fetches, extracts, or executes anything.

export interface ModEntry {
  /** Display name with any `.disabled` suffix stripped. */
  name: string;
  /** Actual on-disk entry name — pass this back to toggleMod. */
  raw_name: string;
  enabled: boolean;
  is_dir: boolean;
}

export function listMods(dir: string): Promise<ModEntry[]> {
  return invoke<ModEntry[]>("list_mods", { dir });
}

/** Returns the entry's new on-disk name (raw_name) after the rename. */
export function toggleMod(dir: string, rawName: string, enabled: boolean): Promise<string> {
  return invoke<string>("toggle_mod", { dir, rawName, enabled });
}

/** Persists display order only — see decision 0032: this is bookkeeping
 *  for a generic, engine-agnostic tool, not enforced in-game load order. */
export function setModOrder(dir: string, order: string[]): Promise<void> {
  return invoke<void>("set_mod_order", { dir, order });
}

/** A handful of conventional subfolder names, checked for existence
 *  under `installDir` and returned if present. Suggestions only. */
export function suggestModDirs(installDir: string): Promise<string[]> {
  return invoke<string[]>("suggest_mod_dirs", { installDir });
}

// Remembers which mods folder the user picked for which game, so
// reopening the plugin window doesn't ask again every time. Purely a
// UI convenience — same local-only, best-effort pattern as
// lib/manualGames.ts and lib/multiplayerFlag.ts. The actual order data
// lives with the mods themselves (the .drmfree-mod-order.json sidecar
// mods.rs writes), not here — this is only "which folder did we last
// point at for this game."
const CHOSEN_DIR_STORAGE_KEY = "drmfree-launcher:mod-manager-chosen-dirs";

function gameKey(provider: string, id: string): string {
  return `${provider}:${id}`;
}

function readChosenDirs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHOSEN_DIR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getChosenModsDir(provider: string, id: string): string | null {
  return readChosenDirs()[gameKey(provider, id)] ?? null;
}

export function setChosenModsDir(provider: string, id: string, dir: string): void {
  const all = readChosenDirs();
  all[gameKey(provider, id)] = dir;
  try {
    localStorage.setItem(CHOSEN_DIR_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort only.
  }
}
