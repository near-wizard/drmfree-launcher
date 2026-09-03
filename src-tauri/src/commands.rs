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

#[cfg(test)]
mod tests {
    use super::*;

    // list_games/list_providers have no prior coverage at all: this
    // module is the entire Tauri command surface, so a regression here
    // (e.g. a provider panicking mid-scan, or all_providers() silently
    // dropping an entry) would break the app with nothing catching it
    // first. These don't assert on *what* games are found (that's
    // machine-dependent and each provider's own tests cover detection
    // logic already) — just that the aggregation/lookup plumbing itself
    // behaves.

    #[test]
    fn list_providers_includes_every_registered_provider() {
        let providers = list_providers();
        let ids: Vec<&str> = providers.iter().map(|p| p.id).collect();
        assert!(ids.contains(&"steam"));
        assert!(ids.contains(&"gog"));
        assert!(ids.contains(&"epic"));
        // Every provider must carry a non-empty display name — the UI
        // falls back to the raw id otherwise, which would look broken.
        assert!(providers.iter().all(|p| !p.display_name.is_empty()));
    }

    #[test]
    fn list_games_does_not_panic_and_only_returns_known_providers() {
        // Can't assert a specific game list (machine-dependent), but it
        // must never panic, and every returned game's provider id must
        // be one all_providers() actually knows about.
        let known: Vec<&str> = all_providers().iter().map(|p| p.id()).collect();
        let games = list_games();
        assert!(games.iter().all(|g| known.contains(&g.provider)));
    }

    #[test]
    fn launch_game_rejects_unknown_provider() {
        let result = launch_game("not-a-real-provider".to_string(), "123".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown provider"));
    }

    #[test]
    fn launch_game_rejects_id_not_currently_installed() {
        // "steam" is a real provider id, but this id will never match a
        // real detected game — exercises the re-detect-don't-trust-the-
        // payload path (the whole reason this command re-scans instead
        // of launching whatever id it's handed) without depending on
        // Steam actually being installed on the machine running tests.
        let result = launch_game("steam".to_string(), "definitely-not-installed-xyz".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn open_install_folder_rejects_unknown_provider() {
        let result = open_install_folder("not-a-real-provider".to_string(), "123".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown provider"));
    }

    #[test]
    fn open_install_folder_rejects_id_not_currently_installed() {
        let result =
            open_install_folder("gog".to_string(), "definitely-not-installed-xyz".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}
