//! Opt-in plugin modules (decision 0027). A plugin is never a tab in the
//! main window — it's a separate Tauri window/webview, scoped by its own
//! `capabilities/plugin-<id>.json` file, so enabling one never hands it
//! anything the main window itself has (opener/updater/process today —
//! see `capabilities/default.json`). Every plugin starts disabled; the
//! frontend (`src/lib/plugins.ts`) tracks enabled state locally and this
//! module only ever opens a window when asked to.
//!
//! No plugin has any real commands yet — `PLUGINS` exists so the
//! scaffold (registry + window-per-plugin + narrower capability file) is
//! real and testable before "Mod Manager" grows anything it can actually
//! do (see decision 0026's still-open phasing question).

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Copy)]
struct PluginDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    /// Must match a `capabilities/plugin-<window_label suffix>.json`
    /// file's own `"windows"` entry — that's what actually scopes this
    /// window to fewer permissions than the main one, not anything in
    /// this file.
    window_label: &'static str,
}

const PLUGINS: &[PluginDef] = &[PluginDef {
    id: "mods",
    name: "Mod Manager",
    description: "Enable, disable, and reorder local mods for supported games. A scaffold today — no install/catalog commands exist yet (decision 0026).",
    window_label: "plugin-mods",
}];

#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

/// Every registered plugin, regardless of enabled state — enabled/
/// disabled is frontend-local (localStorage), not backend state, same
/// as this app already does for the last-selected tab and manual game
/// entries. Nothing here implies trust or access; it's just "what
/// exists to be turned on."
#[tauri::command]
pub fn list_plugins() -> Vec<PluginInfo> {
    PLUGINS
        .iter()
        .map(|p| PluginInfo {
            id: p.id,
            name: p.name,
            description: p.description,
        })
        .collect()
}

/// Opens a plugin's own window (or focuses it if already open). The
/// window loads the same SPA bundle as the main app but with
/// `?plugin=<id>` in its URL, which `src/main.tsx` uses to mount that
/// plugin's own root component instead of `<App />` — so a plugin
/// window never even constructs the main library/store/wishlist UI,
/// let alone shares its state.
#[tauri::command]
pub fn open_plugin_window(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let def = PLUGINS
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("unknown plugin: {plugin_id}"))?;

    if let Some(existing) = app.get_webview_window(def.window_label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // #[tauri::command] handlers run on a worker thread, not the event
    // loop's main thread — building a native window off the main thread
    // produces one that renders but never responds to native chrome
    // (the close button included), because nothing pumps its message
    // loop on the thread that actually owns the window handle. Window
    // creation has to be dispatched onto the main thread explicitly.
    let label = def.window_label;
    let title = def.name;
    let url = format!("index.html?plugin={}", def.id);
    let app_for_window = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = WebviewWindowBuilder::new(&app_for_window, label, WebviewUrl::App(url.into()))
            .title(title)
            .inner_size(760.0, 560.0)
            .build()
        {
            eprintln!("failed to open plugin window '{label}': {e}");
        }
    })
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_plugins_includes_mod_manager_disabled_by_default_metadata() {
        let plugins = list_plugins();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].id, "mods");
        assert_eq!(plugins[0].name, "Mod Manager");
    }

    #[test]
    fn every_plugin_def_has_a_matching_window_label_distinct_from_its_id() {
        // Not strictly required by Tauri, but the naming convention this
        // module documents (capabilities/plugin-<id>.json) only holds if
        // window_label actually derives from id — this test is a
        // trip-wire so a future plugin entry can't silently drift from
        // that convention.
        for def in PLUGINS {
            assert_eq!(def.window_label, format!("plugin-{}", def.id));
        }
    }
}
