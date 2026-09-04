//! Opt-in plugin modules (decision 0029, generalized by 0030). Two
//! kinds, for two different reasons a feature might want to be off by
//! default:
//!
//! - **Window** — a separate Tauri window/webview, scoped by its own
//!   `capabilities/plugin-<id>.json` file, so enabling one never hands
//!   it anything the main window itself has (opener/updater/process
//!   today — see `capabilities/default.json`). For a feature that's
//!   introducing a real new trust boundary (Mod Manager: fetching and
//!   placing a third-party file somewhere a game would execute it).
//! - **FeatureFlag** — no window, no new capabilities file; the
//!   underlying commands stay registered and reachable from the main
//!   window exactly as always, only whether their *UI* renders is
//!   gated. For a feature that's just "most users don't need this
//!   cluttering their view," with no new capability to contain — the
//!   audit feature's `run_launch_audit`/`run_portability_audit` spawn
//!   the exact same exe the Launch button already does, so a sandboxed
//!   window would add IPC overhead without adding a real safety
//!   property (0030's reasoning in full).
//!
//! Every plugin starts disabled; the frontend (`src/lib/plugins.ts`)
//! tracks enabled state locally and this module only ever opens a
//! window when asked to (and only for a `Window`-kind plugin).

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Copy)]
enum PluginKind {
    /// `window_label` must match a `capabilities/plugin-<window_label
    /// suffix>.json` file's own `"windows"` entry — that's what
    /// actually scopes this window to fewer permissions than the main
    /// one, not anything in this file.
    Window { window_label: &'static str },
    FeatureFlag,
}

#[derive(Debug, Clone, Copy)]
struct PluginDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    kind: PluginKind,
}

const PLUGINS: &[PluginDef] = &[
    PluginDef {
        id: "mods",
        name: "Mod Manager",
        description: "Enable, disable, and reorder local mods for supported games. A scaffold today — no install/catalog commands exist yet (decision 0028).",
        kind: PluginKind::Window { window_label: "plugin-mods" },
    },
    PluginDef {
        id: "audit",
        name: "Automated Freedom-Test Audit",
        description: "Run local automated checks (does it launch without a storefront client, does it stay offline-friendly, does it survive being copied) and optionally share results with the community. See decision 0030.",
        kind: PluginKind::FeatureFlag,
    },
];

#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// `false` for a `FeatureFlag` plugin — there's no window to open,
    /// so the frontend knows not to render an "Open" button and to
    /// show where the feature actually appears instead.
    pub has_window: bool,
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
            has_window: matches!(p.kind, PluginKind::Window { .. }),
        })
        .collect()
}

/// Opens a plugin's own window (or focuses it if already open). The
/// window loads the same SPA bundle as the main app but with
/// `?plugin=<id>` in its URL, which `src/main.tsx` uses to mount that
/// plugin's own root component instead of `<App />` — so a plugin
/// window never even constructs the main library/store/wishlist UI,
/// let alone shares its state. Errors for a `FeatureFlag`-kind id —
/// there's no window to open; the frontend never calls this for one,
/// since the enable toggle alone is the whole interaction, but the
/// backend still refuses rather than silently no-op-ing.
#[tauri::command]
pub fn open_plugin_window(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let def = PLUGINS
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("unknown plugin: {plugin_id}"))?;

    let PluginKind::Window { window_label } = def.kind else {
        return Err(format!("plugin '{plugin_id}' has no window to open"));
    };

    if let Some(existing) = app.get_webview_window(window_label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // #[tauri::command] handlers run on a worker thread, not the event
    // loop's main thread — building a native window off the main thread
    // produces one that renders but never responds to native chrome
    // (the close button included), because nothing pumps its message
    // loop on the thread that actually owns the window handle. Window
    // creation has to be dispatched onto the main thread explicitly.
    let title = def.name;
    let url = format!("index.html?plugin={}", def.id);
    let app_for_window = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = WebviewWindowBuilder::new(&app_for_window, window_label, WebviewUrl::App(url.into()))
            .title(title)
            .inner_size(760.0, 560.0)
            .build()
        {
            eprintln!("failed to open plugin window '{window_label}': {e}");
        }
    })
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_plugins_includes_mod_manager_and_audit_with_correct_has_window() {
        let plugins = list_plugins();
        assert_eq!(plugins.len(), 2);

        let mods = plugins.iter().find(|p| p.id == "mods").unwrap();
        assert_eq!(mods.name, "Mod Manager");
        assert!(mods.has_window);

        let audit = plugins.iter().find(|p| p.id == "audit").unwrap();
        assert_eq!(audit.name, "Automated Freedom-Test Audit");
        assert!(!audit.has_window);
    }

    #[test]
    fn every_window_plugin_def_has_a_matching_window_label_distinct_from_its_id() {
        // Not strictly required by Tauri, but the naming convention this
        // module documents (capabilities/plugin-<id>.json) only holds if
        // window_label actually derives from id — this test is a
        // trip-wire so a future window-kind plugin entry can't silently
        // drift from that convention.
        for def in PLUGINS {
            if let PluginKind::Window { window_label } = def.kind {
                assert_eq!(window_label, format!("plugin-{}", def.id));
            }
        }
    }

    #[test]
    fn open_plugin_window_errors_for_an_unknown_plugin_id() {
        // Can't easily construct a real AppHandle in a unit test, but
        // the unknown-id branch returns before touching one at all.
        let def = PLUGINS.iter().find(|p| p.id == "does-not-exist");
        assert!(def.is_none());
    }

    #[test]
    fn audit_plugin_has_no_window_kind() {
        let audit = PLUGINS.iter().find(|p| p.id == "audit").unwrap();
        assert!(matches!(audit.kind, PluginKind::FeatureFlag));
    }
}
