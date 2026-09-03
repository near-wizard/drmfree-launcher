// Humble Bundle's own catalog (not the Humble Choice/Trove
// subscription tiers gated behind an active subscription) is sold
// DRM-free, same storefront-wide policy as GOG — see decision 0020.
//
// Detection reads the Humble App's own local state file directly,
// same spirit as gog.rs's Windows registry scan and Heroic-config
// read: no official Humble documentation covers this format, so the
// schema below is verified against a real, current, maintained
// open-source detector's source (Nutzzz/GLC, Platforms/Humble.cs) —
// not guessed. Only Windows is covered: that same reference
// implementation is itself Windows-only (`[SupportedOSPlatform
// ("windows")]`), which is the best signal available that no widely
// used Mac/Linux equivalent has been reverse-engineered yet.
use super::{Game, GameProvider};
#[cfg(any(target_os = "windows", test))]
use super::{DrmDeterminationMethod, DrmRecord};
#[cfg(any(target_os = "windows", test))]
use serde::Deserialize;

#[cfg(any(target_os = "windows", test))]
const HUMBLE_POLICY_VERIFIED_ON: &str = "2026-09-03";

pub struct HumbleProvider;

impl GameProvider for HumbleProvider {
    fn id(&self) -> &'static str {
        "humble"
    }

    fn display_name(&self) -> &'static str {
        "Humble Bundle"
    }

    fn detect_installed_games(&self) -> Vec<Game> {
        #[cfg(target_os = "windows")]
        {
            windows::detect()
        }

        #[cfg(not(target_os = "windows"))]
        {
            Vec::new()
        }
    }

    fn launch(&self, game: &Game) -> Result<(), String> {
        // Humble titles are DRM-free: run the installed executable
        // directly, same as GOG. The Humble App does have its own
        // humble://launch/<id> protocol handler, but reproducing it
        // would mean parsing a registry command template just to
        // launch a game we already have a direct exe path for —
        // config.json's own filePath/executablePath fields are
        // simpler and match this project's existing "run the exe
        // directly" model for DRM-free providers.
        let Some(exe) = &game.exe_path else {
            return Err(format!("no executable recorded for {}", game.name));
        };
        open::that(exe).map_err(|e| format!("failed to launch {}: {e}", game.name))
    }
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Deserialize)]
struct HumbleConfig {
    #[serde(default)]
    user: HumbleUser,
    // Version-suffixed key (per GLC's own naming, implying it's been
    // bumped across Humble App updates before) — if a future app
    // version renames this to e.g. "game-collection-5", detection
    // silently returns nothing rather than erroring, same as any
    // other unreadable/unexpected config shape below.
    #[serde(rename = "game-collection-4", default)]
    game_collection: Vec<HumbleEntry>,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Deserialize, Default)]
struct HumbleUser {
    #[serde(default)]
    owns_active_content: bool,
    #[serde(default)]
    is_paused: bool,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HumbleEntry {
    #[serde(default)]
    is_available: bool,
    #[serde(default)]
    machine_name: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    game_name: String,
    #[serde(default)]
    download_machine_name: String,
    #[serde(default)]
    gamekey: String,
    executable_path: Option<String>,
    file_path: Option<String>,
}

#[cfg(any(target_os = "windows", test))]
fn entry_to_game(entry: &HumbleEntry, user: &HumbleUser) -> Option<Game> {
    if !entry.is_available {
        return None;
    }
    if entry.status != "downloaded" && entry.status != "installed" {
        return None;
    }
    // Humble Choice/subscription games stay marked "installed" in
    // config.json even after the subscription lapses — without this
    // check they'd show as playable ghosts the user can no longer
    // actually launch.
    if entry.machine_name.ends_with("_collection") && !(user.owns_active_content && !user.is_paused)
    {
        return None;
    }

    let file_path = entry.file_path.clone()?;
    let executable_path = entry.executable_path.clone()?;
    let id = if !entry.download_machine_name.is_empty() {
        entry.download_machine_name.clone()
    } else {
        format!("humble_{}", entry.gamekey)
    };

    Some(Game {
        id,
        name: entry.game_name.clone(),
        provider: "humble",
        install_dir: Some(file_path.clone()),
        // executablePath is relative to filePath in the source data —
        // must be joined, a bare executablePath alone isn't launchable.
        exe_path: Some(
            std::path::Path::new(&file_path)
                .join(&executable_path)
                .to_string_lossy()
                .to_string(),
        ),
        drm: DrmRecord::drm_free("humble", DrmDeterminationMethod::StorefrontImport, HUMBLE_POLICY_VERIFIED_ON),
    })
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{entry_to_game, HumbleConfig};
    use crate::providers::Game;
    use std::fs;
    use std::path::PathBuf;

    pub fn detect() -> Vec<Game> {
        let Some(path) = config_path() else {
            return Vec::new();
        };
        let Ok(contents) = fs::read_to_string(&path) else {
            return Vec::new();
        };
        let Ok(config) = serde_json::from_str::<HumbleConfig>(&contents) else {
            return Vec::new();
        };
        config
            .game_collection
            .iter()
            .filter_map(|e| entry_to_game(e, &config.user))
            .collect()
    }

    // Roaming, not Local — matches where the Humble App itself writes
    // it (per-user, not per-machine).
    fn config_path() -> Option<PathBuf> {
        std::env::var("APPDATA")
            .ok()
            .map(|appdata| PathBuf::from(appdata).join("Humble App").join("config.json"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::DrmStatus;

    fn entry(overrides: &str) -> HumbleEntry {
        let base = r#"{
            "isAvailable": true,
            "machineName": "riskoftrain_trove",
            "status": "installed",
            "gameName": "Risk of Rain",
            "downloadMachineName": "risktrain_win",
            "gamekey": "abc123",
            "executablePath": "RiskOfRain.exe",
            "filePath": "C:\\Games\\Humble\\RiskOfRain"
        }"#;
        let merged: serde_json::Value = {
            let mut b: serde_json::Value = serde_json::from_str(base).unwrap();
            let o: serde_json::Value = serde_json::from_str(overrides).unwrap();
            for (k, v) in o.as_object().unwrap() {
                b[k] = v.clone();
            }
            b
        };
        serde_json::from_value(merged).unwrap()
    }

    fn active_user() -> HumbleUser {
        HumbleUser { owns_active_content: true, is_paused: false }
    }

    #[test]
    fn config_parses_real_shape_with_version_suffixed_key() {
        let json = r#"{
            "user": { "owns_active_content": true, "is_paused": false, "has_perks": false },
            "game-collection-4": [
                {
                    "isAvailable": true,
                    "machineName": "riskofrain_trove",
                    "status": "installed",
                    "gameName": "Risk of Rain",
                    "downloadMachineName": "riskofrain_win",
                    "gamekey": "abc123",
                    "executablePath": "RiskOfRain.exe",
                    "filePath": "C:\\Games\\Humble\\RiskOfRain"
                }
            ]
        }"#;
        let config: HumbleConfig = serde_json::from_str(json).unwrap();
        assert!(config.user.owns_active_content);
        assert_eq!(config.game_collection.len(), 1);
        assert_eq!(config.game_collection[0].game_name, "Risk of Rain");
    }

    #[test]
    fn config_defaults_to_empty_when_collection_key_is_missing() {
        // The version-suffixed key changing across app updates
        // shouldn't crash detection — just find nothing.
        let json = r#"{ "user": { "owns_active_content": false, "is_paused": false } }"#;
        let config: HumbleConfig = serde_json::from_str(json).unwrap();
        assert!(config.game_collection.is_empty());
    }

    #[test]
    fn entry_to_game_maps_a_normal_installed_entry() {
        let game = entry_to_game(&entry("{}"), &active_user()).unwrap();
        assert_eq!(game.id, "risktrain_win");
        assert_eq!(game.name, "Risk of Rain");
        assert_eq!(game.provider, "humble");
        assert_eq!(game.install_dir.as_deref(), Some("C:\\Games\\Humble\\RiskOfRain"));
        assert_eq!(
            game.exe_path.as_deref(),
            Some("C:\\Games\\Humble\\RiskOfRain\\RiskOfRain.exe")
        );
        assert_eq!(game.drm.status, DrmStatus::DrmFree);
    }

    #[test]
    fn entry_to_game_falls_back_to_humble_prefixed_gamekey_when_download_name_empty() {
        let e = entry(r#"{ "downloadMachineName": "" }"#);
        let game = entry_to_game(&e, &active_user()).unwrap();
        assert_eq!(game.id, "humble_abc123");
    }

    #[test]
    fn entry_to_game_skips_unavailable_entries() {
        let e = entry(r#"{ "isAvailable": false }"#);
        assert!(entry_to_game(&e, &active_user()).is_none());
    }

    #[test]
    fn entry_to_game_skips_entries_not_downloaded_or_installed() {
        let e = entry(r#"{ "status": "available" }"#);
        assert!(entry_to_game(&e, &active_user()).is_none());
    }

    #[test]
    fn entry_to_game_accepts_downloaded_status_same_as_installed() {
        let e = entry(r#"{ "status": "downloaded" }"#);
        assert!(entry_to_game(&e, &active_user()).is_some());
    }

    #[test]
    fn entry_to_game_skips_lapsed_subscription_games() {
        // Real gotcha from research: a _collection (Humble Choice)
        // entry can still say status: "installed" after the
        // subscription itself has ended — must not show as playable.
        let e = entry(r#"{ "machineName": "some_game_collection" }"#);
        let lapsed = HumbleUser { owns_active_content: false, is_paused: false };
        assert!(entry_to_game(&e, &lapsed).is_none());
    }

    #[test]
    fn entry_to_game_skips_paused_subscription_games() {
        let e = entry(r#"{ "machineName": "some_game_collection" }"#);
        let paused = HumbleUser { owns_active_content: true, is_paused: true };
        assert!(entry_to_game(&e, &paused).is_none());
    }

    #[test]
    fn entry_to_game_keeps_active_subscription_games() {
        let e = entry(r#"{ "machineName": "some_game_collection" }"#);
        assert!(entry_to_game(&e, &active_user()).is_some());
    }

    #[test]
    fn entry_to_game_skips_entries_missing_file_path() {
        let e = entry(r#"{ "filePath": null }"#);
        assert!(entry_to_game(&e, &active_user()).is_none());
    }

    #[test]
    fn entry_to_game_skips_entries_missing_executable_path() {
        let e = entry(r#"{ "executablePath": null }"#);
        assert!(entry_to_game(&e, &active_user()).is_none());
    }
}
