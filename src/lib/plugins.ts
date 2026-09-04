import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "drmfree-launcher:enabled-plugins";

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  /** `false` for a feature-flag plugin (e.g. "audit") — there's no
   *  window to open; the feature appears inline elsewhere instead. */
  has_window: boolean;
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

// Every tab in this app stays mounted simultaneously (App.tsx uses
// `hidden`, not conditional rendering, to switch tabs) — so a
// GameCard already on screen in the Library tab won't naturally
// re-read localStorage just because the Plugins tab wrote to it. The
// browser's own `storage` event doesn't help either: it only fires in
// *other* documents/windows, never the one that made the write. This
// custom event is the same mechanism, scoped to this one document, so
// a feature-flag plugin like "audit" can react to being toggled
// without a page reload.
const PLUGIN_TOGGLED_EVENT = "drmfree-launcher:plugin-toggled";

interface PluginToggledDetail {
  id: string;
  enabled: boolean;
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
  window.dispatchEvent(new CustomEvent<PluginToggledDetail>(PLUGIN_TOGGLED_EVENT, { detail: { id, enabled } }));
}

/** Subscribes to plugin enable/disable toggles for the lifetime of the
 * caller's effect — returns the unsubscribe function. Use this (not
 * polling `isPluginEnabled` on an interval) for any UI that needs to
 * react live to a feature-flag plugin being turned on/off elsewhere in
 * the same window. */
export function onPluginToggled(handler: (id: string, enabled: boolean) => void): () => void {
  function listener(e: Event) {
    const { id, enabled } = (e as CustomEvent<PluginToggledDetail>).detail;
    handler(id, enabled);
  }
  window.addEventListener(PLUGIN_TOGGLED_EVENT, listener);
  return () => window.removeEventListener(PLUGIN_TOGGLED_EVENT, listener);
}

// Opens the plugin's own Tauri window. The backend (plugins.rs) is the
// source of truth for which plugin ids exist and what window each maps
// to — this is a thin call-through, not a second registry.
export function openPluginWindow(id: string): Promise<void> {
  return invoke("open_plugin_window", { pluginId: id });
}
