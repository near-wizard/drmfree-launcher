use super::{DrmRecord, Game, GameProvider};
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
        // Epic's protocol handler needs the composite
        // "CatalogNamespace:CatalogItemId:AppName" id, not AppName
        // alone — AppName-only opens the launcher but matches no app,
        // so it silently does nothing rather than erroring. The
        // composite is assembled in manifest_to_game and carried here
        // via exe_path (this provider's only use for that field, since
        // there's no direct exe to launch — Epic always mediates).
        let launch_id = game.exe_path.as_deref().unwrap_or(&game.id);
        let uri = format!(
            "com.epicgames.launcher://apps/{launch_id}?action=launch&silent=true"
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
    /// Together with `catalog_item_id` and `app_name`, forms the
    /// composite id Epic's `com.epicgames.launcher://apps/<ns>:<item>:<app>`
    /// protocol handler actually matches against — AppName alone opens
    /// the launcher but launches nothing.
    #[serde(rename = "CatalogNamespace")]
    catalog_namespace: Option<String>,
    #[serde(rename = "CatalogItemId")]
    catalog_item_id: Option<String>,
    /// The real installed exe filename, relative to `InstallLocation` —
    /// used only as a cover-art fallback (extracting the exe's own
    /// icon). Epic mediates every launch through its protocol handler,
    /// so this is never used to actually launch the game.
    #[serde(rename = "LaunchExecutable")]
    launch_executable: Option<String>,
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
    // %3A-encoded to match what Epic's own launcher writes into its
    // shortcuts/shell registrations — colons are a URI reserved
    // character and passing them raw has been unreliable in testing.
    let launch_id = match (&manifest.catalog_namespace, &manifest.catalog_item_id) {
        (Some(ns), Some(item)) if !ns.is_empty() && !item.is_empty() => Some(format!(
            "{ns}%3A{item}%3A{app}",
            ns = ns,
            item = item,
            app = manifest.app_name
        )),
        // Older/incomplete manifests occasionally lack these fields —
        // fall back to AppName alone rather than dropping the game
        // from the library; it just won't launch until Epic itself
        // repairs the manifest.
        _ => None,
    };
    // Epic's own storefront API isn't scanned for cover art (see
    // get_epic_cover_art doc comment) — extracting the icon straight
    // off the installed exe is a real, if smaller, image rather than
    // nothing at all.
    // super::windows_path_join, not PathBuf::join: Epic manifests are
    // always Windows-shaped data (InstallLocation/LaunchExecutable use
    // backslashes on every platform Epic writes them from) regardless
    // of what OS this is compiled/tested on — see that function's doc
    // comment for the CI failure this avoids.
    let icon_source = match (&manifest.install_location, &manifest.launch_executable) {
        (Some(dir), Some(exe)) if !exe.is_empty() => Some(super::windows_path_join(dir, exe)),
        _ => None,
    };
    Some(Game {
        id: manifest.app_name,
        name: manifest.display_name,
        provider: "epic",
        install_dir: manifest.install_location,
        exe_path: launch_id,
        icon_source,
        drm: DrmRecord::unknown(),
        drm_axes: None,
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

    // Regression: launch() was using AppName alone in the protocol URI,
    // which opens the Epic launcher but matches no app — it needs the
    // composite namespace:catalogItemId:appName id instead. Caught via
    // a real user report ("Epic games not launching but Steam does").
    #[test]
    fn manifest_to_game_builds_composite_launch_id_from_catalog_fields() {
        let contents = r#"{
            "AppName": "abc123",
            "DisplayName": "Fortnite",
            "bIsApplication": true,
            "CatalogNamespace": "fn",
            "CatalogItemId": "5cb97847cee34581afdbc445ecbc1e97"
        }"#;
        let game = manifest_to_game(contents).unwrap();
        assert_eq!(
            game.exe_path.as_deref(),
            Some("fn%3A5cb97847cee34581afdbc445ecbc1e97%3Aabc123")
        );
    }

    // icon_source is a real filesystem path (InstallLocation joined
    // with LaunchExecutable), unlike exe_path above which is a
    // protocol-handler id — the two must not be confused with each
    // other, since only icon_source is safe to hand to the exe-icon
    // extractor.
    #[test]
    fn manifest_to_game_joins_install_location_and_launch_executable_for_icon_source() {
        let contents = r#"{
            "AppName": "Discus",
            "DisplayName": "For The King",
            "bIsApplication": true,
            "InstallLocation": "C:\\Program Files\\Epic Games\\ForTheKing",
            "LaunchExecutable": "FTK.exe"
        }"#;
        let game = manifest_to_game(contents).unwrap();
        assert_eq!(
            game.icon_source.as_deref(),
            Some("C:\\Program Files\\Epic Games\\ForTheKing\\FTK.exe")
        );
    }

    #[test]
    fn manifest_to_game_has_no_icon_source_without_launch_executable() {
        let contents = r#"{
            "AppName": "abc123",
            "DisplayName": "Fortnite",
            "bIsApplication": true,
            "InstallLocation": "C:\\Games\\Fortnite"
        }"#;
        let game = manifest_to_game(contents).unwrap();
        assert_eq!(game.icon_source, None);
    }

    #[test]
    fn manifest_to_game_falls_back_to_none_without_catalog_fields() {
        let contents = r#"{
            "AppName": "abc123",
            "DisplayName": "Fortnite",
            "bIsApplication": true
        }"#;
        let game = manifest_to_game(contents).unwrap();
        assert_eq!(game.exe_path, None);
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
