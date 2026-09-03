use crate::providers::{all_providers, Game};
use serde::Serialize;

/// Aggregated library: every provider's installed games, unified into one
/// list. This is the read-only "your library" view — never mixed with any
/// future marketplace listing (see project brief, Principle 3).
#[tauri::command]
pub fn list_games() -> Vec<Game> {
    all_providers()
        .iter()
        .flat_map(|p| p.detect_installed_games())
        .collect()
}

#[derive(Serialize)]
pub struct ProviderInfo {
    id: &'static str,
    display_name: &'static str,
}

/// Provider id -> display name, so the UI has a single source of truth
/// instead of hardcoding storefront labels itself.
#[tauri::command]
pub fn list_providers() -> Vec<ProviderInfo> {
    all_providers()
        .iter()
        .map(|p| ProviderInfo {
            id: p.id(),
            display_name: p.display_name(),
        })
        .collect()
}

#[tauri::command]
pub fn launch_game(provider: String, id: String) -> Result<(), String> {
    let providers = all_providers();
    let provider = providers
        .iter()
        .find(|p| p.id() == provider)
        .ok_or_else(|| format!("unknown provider: {provider}"))?;

    // Re-detect rather than trust a client-supplied Game payload wholesale;
    // keeps launch targets limited to what's actually installed right now.
    let game = provider
        .detect_installed_games()
        .into_iter()
        .find(|g| g.id == id)
        .ok_or_else(|| format!("game {id} not found for provider {}", provider.id()))?;

    provider.launch(&game)
}

/// Opens a game's install directory in the OS file manager (Explorer,
/// Finder, whatever the desktop's default handler for a folder is).
/// Every provider already collects `install_dir` while detecting
/// games (it was going unused until now) — this is the same
/// re-detect-don't-trust-the-payload pattern as `launch_game`, so a
/// stale/tampered client-supplied path can't be opened.
#[tauri::command]
pub fn open_install_folder(provider: String, id: String) -> Result<(), String> {
    let providers = all_providers();
    let provider = providers
        .iter()
        .find(|p| p.id() == provider)
        .ok_or_else(|| format!("unknown provider: {provider}"))?;

    let game = provider
        .detect_installed_games()
        .into_iter()
        .find(|g| g.id == id)
        .ok_or_else(|| format!("game {id} not found for provider {}", provider.id()))?;

    let install_dir = game
        .install_dir
        .ok_or_else(|| format!("no install directory known for {}", game.name))?;

    open::that(&install_dir).map_err(|e| format!("failed to open {install_dir}: {e}"))
}
