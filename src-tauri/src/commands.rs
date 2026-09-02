use crate::providers::{all_providers, Game};

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
