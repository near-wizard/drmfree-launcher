use super::{DrmStatus, Game, GameProvider};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

pub struct EpicProvider;

impl GameProvider for EpicProvider {
    fn id(&self) -> &'static str {
        "epic"
    }

    fn display_name(&self) -> &'static str {
        "Epic Games"
    }

    fn detect_installed_games(&self) -> Vec<Game> {
        let Some(manifests_dir) = manifests_dir() else {
            return Vec::new();
        };

        games_from_manifests(&manifests_dir)
    }

    fn launch(&self, game: &Game) -> Result<(), String> {
        // Native protocol handoff, same shape as the Steam provider —
        // the Epic client itself decides how to launch the game.
        let uri = format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            game.id
        );
        open::that(&uri).map_err(|e| format!("failed to open {uri}: {e}"))
    }
}

/// Epic's launcher has no native Linux client, so there's no standard
/// manifest location to scan there — same limitation as the GOG provider.
fn manifests_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("ProgramData")
            .ok()
            .map(|pd| PathBuf::from(pd).join("Epic\\EpicGamesLauncher\\Data\\Manifests"))
    }

    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .map(|h| h.join("Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests"))
    }

    #[cfg(target_os = "linux")]
    {
        None
    }
    .filter(|p: &PathBuf| p.exists())
}

/// The subset of an Epic `.item` manifest we care about. Manifests carry
/// many more fields (install size, version, tags, ...) that Stage 0 has
/// no use for.
#[derive(Deserialize)]
struct EpicManifest {
    #[serde(rename = "AppName")]
    app_name: String,
    #[serde(rename = "DisplayName")]
    display_name: String,
    #[serde(rename = "InstallLocation")]
    install_location: Option<String>,
    /// A manifest can exist for DLC/content packs bundled alongside a
    /// game (e.g. "Fortnite Save the World Content") that Epic itself
    /// does not consider a launchable app — `bIsApplication: false`,
    /// no `LaunchExecutable`. Launching one of these via the protocol
    /// handler does nothing, so they must be filtered out rather than
    /// listed as if they were games.
    #[serde(rename = "bIsApplication")]
    is_application: bool,
}

fn games_from_manifests(manifests_dir: &std::path::Path) -> Vec<Game> {
    let Ok(entries) = fs::read_dir(manifests_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .to_lowercase()
                .ends_with(".item")
        })
        .filter_map(|e| fs::read_to_string(e.path()).ok())
        .filter_map(|contents| manifest_to_game(&contents))
        .collect()
}

fn manifest_to_game(contents: &str) -> Option<Game> {
    let manifest: EpicManifest = serde_json::from_str(contents).ok()?;
    if !manifest.is_application {
        return None;
    }
    Some(Game {
        id: manifest.app_name,
        name: manifest.display_name,
        provider: "epic",
        install_dir: manifest.install_location,
        exe_path: None,
        drm_status: DrmStatus::Unknown,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-epic-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn manifest_to_game_parses_required_fields() {
        let contents = r#"{
            "AppName": "abc123",
            "DisplayName": "Fortnite",
            "InstallLocation": "C:\\Games\\Fortnite",
            "bIsApplication": true,
            "InstallSize": 12345
        }"#;
        let game = manifest_to_game(contents).unwrap();
        assert_eq!(game.id, "abc123");
        assert_eq!(game.name, "Fortnite");
        assert_eq!(game.provider, "epic");
        assert_eq!(game.install_dir, Some("C:\\Games\\Fortnite".to_string()));
    }

    #[test]
    fn manifest_to_game_rejects_malformed_json() {
        assert!(manifest_to_game("not json").is_none());
    }

    #[test]
    fn manifest_to_game_rejects_missing_required_field() {
        let contents = r#"{ "AppName": "abc123", "bIsApplication": true }"#; // no DisplayName
        assert!(manifest_to_game(contents).is_none());
    }

    #[test]
    fn manifest_to_game_rejects_non_application_entries() {
        // Real-world case: Epic writes a manifest for bundled DLC/content
        // packs (e.g. "Fortnite Save the World Content") alongside the
        // actual game. bIsApplication: false means Epic itself won't
        // launch it — it must not be listed as a playable game.
        let contents = r#"{
            "AppName": "aa31f9e94e844b299ca757d1d0b97a09",
            "DisplayName": "Fortnite Save the World Content",
            "InstallLocation": "C:\\Program Files\\Epic Games\\Fortnite",
            "bIsApplication": false
        }"#;
        assert!(manifest_to_game(contents).is_none());
    }

    #[test]
    fn games_from_manifests_reads_only_dot_item_files() {
        let dir = temp_dir("filtering");
        fs::write(
            dir.join("abc123.item"),
            r#"{ "AppName": "abc123", "DisplayName": "Game A", "bIsApplication": true }"#,
        )
        .unwrap();
        fs::write(dir.join("readme.txt"), "not a manifest").unwrap();

        let games = games_from_manifests(&dir);

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "Game A");

        fs::remove_dir_all(&dir).unwrap();
    }
}
