import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "drmfree-launcher:enabled-plugins";

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

export function listPlugins(): Promise<PluginInfo[]> {
  return invoke<PluginInfo[]>("list_plugins");
}

function loadEnabledIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// Nothing is enabled until this returns true for it at least once —
// there's no seeded/default-on entry anywhere in this module (decision
// 0027: every plugin is opt-in, no exceptions).
export function isPluginEnabled(id: string): boolean {
  return loadEnabledIds().has(id);
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const ids = loadEnabledIds();
  if (enabled) {
    ids.add(id);
  } else {
    ids.delete(id);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort only, same as lib/lastTab.ts — a full/unavailable
    // localStorage shouldn't break toggling a plugin for this session.
  }
}

// Opens the plugin's own Tauri window. The backend (plugins.rs) is the
// source of truth for which plugin ids exist and what window each maps
// to — this is a thin call-through, not a second registry.
export function openPluginWindow(id: string): Promise<void> {
  return invoke("open_plugin_window", { pluginId: id });
}
