use super::{Game, GameProvider};
use serde::Deserialize;
// DrmRecord/DrmDeterminationMethod are only actually used by the
// Windows registry scan below — GOG detection doesn't exist yet on
// other platforms (see `detect_installed_games`), so importing these
// unconditionally makes them (and everything downstream of them:
// resolve_exe_path, GOG_POLICY_VERIFIED_ON, even DrmStatus::DrmFree
// and DrmDeterminationMethod::GogImport crate-wide) dead code under
// `-D warnings` on non-Windows targets.
#[cfg(target_os = "windows")]
use super::{DrmDeterminationMethod, DrmRecord};

/// Last date a maintainer confirmed GOG's storefront-wide DRM-free
/// policy still holds. Fixed, not `now()` at scan time — a scan
/// happens on every launch and "verified today" would be meaningless
/// noise rather than an actual audit trail. Update by hand if this
/// policy is ever reconfirmed or changes.
#[cfg(target_os = "windows")]
const GOG_POLICY_VERIFIED_ON: &str = "2026-09-02";

pub struct GogProvider;

impl GameProvider for GogProvider {
    fn id(&self) -> &'static str {
        "gog"
    }

    fn display_name(&self) -> &'static str {
        "GOG"
    }

    fn detect_installed_games(&self) -> Vec<Game> {
        #[cfg(target_os = "windows")]
        {
            windows::detect()
        }

        #[cfg(not(target_os = "windows"))]
        {
            // GOG's offline installer has no standard install location or
            // registration mechanism on Linux/macOS (Galaxy itself doesn't
            // run there), so there's nothing reliable to local-scan yet.
            Vec::new()
        }
    }

    fn launch(&self, game: &Game) -> Result<(), String> {
        // GOG titles are DRM-free: run the installed executable directly.
        // No Galaxy handoff, no protocol handler, no account check —
        // this is the deliberate differentiator from the Steam provider.
        let Some(exe) = &game.exe_path else {
            return Err(format!("no executable recorded for {}", game.name));
        };
        open::that(exe).map_err(|e| format!("failed to launch {}: {e}", game.name))
    }
}

#[derive(Debug, Deserialize)]
struct GogProductImages {
    background: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogProductResponse {
    images: Option<GogProductImages>,
}

/// Looks up cover art for a single GOG game by the numeric product ID
/// already read from its registry key (`Game.id` for gog-provider
/// games) — the same ID system GOG's public product API
/// (`api.gog.com/products/<id>`, no key required) uses, so this is an
/// exact lookup, not a name-matching guess. Returns `Ok(None)` rather
/// than an error when the ID doesn't resolve (a 404) — a missing or
/// renumbered ID isn't a failure worth surfacing, just "no art."
#[tauri::command]
pub async fn get_gog_cover_art(id: String) -> Result<Option<String>, String> {
    let url = format!("https://api.gog.com/products/{id}");
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("failed to reach GOG product API: {e}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let parsed: GogProductResponse = response
        .json()
        .await
        .map_err(|e| format!("failed to parse GOG product response: {e}"))?;

    Ok(parsed
        .images
        .and_then(|i| i.background)
        .map(|bg| normalize_image_url(&bg)))
}

/// GOG's product API returns protocol-relative image URLs
/// (`//images-N.gog-statics.com/...`), which a browser resolves fine
/// inline but an explicit `https:` prefix is needed wherever the URL
/// is used standalone (e.g. handed straight to an `<img src>` from
/// Rust with no surrounding page to inherit a scheme from).
fn normalize_image_url(url: &str) -> String {
    match url.strip_prefix("//") {
        Some(rest) => format!("https://{rest}"),
        None => url.to_string(),
    }
}

/// Resolves a GOG registry entry's `exe` value against its `path` value:
/// absolute exe paths are used as-is, relative ones are joined onto the
/// install path, and a missing/empty exe value falls back to the install
/// path itself.
#[cfg(target_os = "windows")]
fn resolve_exe_path(exe: Option<&str>, install_path: &str) -> std::path::PathBuf {
    use std::path::Path;
    match exe {
        Some(exe) if !exe.is_empty() => {
            let exe_path = Path::new(exe);
            if exe_path.is_absolute() {
                exe_path.to_path_buf()
            } else {
                Path::new(install_path).join(exe_path)
            }
        }
        _ => Path::new(install_path).to_path_buf(),
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{resolve_exe_path, DrmDeterminationMethod, DrmRecord, Game};
    use winreg::enums::*;
    use winreg::RegKey;

    const ROOTS: [&str; 2] = [
        "SOFTWARE\\WOW6432Node\\GOG.com\\Games",
        "SOFTWARE\\GOG.com\\Games",
    ];

    pub fn detect() -> Vec<Game> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut games = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for subkey_path in ROOTS {
            let Ok(games_key) = hklm.open_subkey(subkey_path) else {
                continue;
            };

            for game_id in games_key.enum_keys().filter_map(|k| k.ok()) {
                if !seen_ids.insert(game_id.clone()) {
                    continue; // already found via the other registry view
                }

                let Ok(entry) = games_key.open_subkey(&game_id) else {
                    continue;
                };

                let name: Result<String, _> = entry.get_value("gameName");
                let path: Result<String, _> = entry.get_value("path");
                let exe: Result<String, _> = entry.get_value("exe");

                let (Ok(name), Ok(path)) = (name, path) else {
                    continue;
                };

                let exe_path = resolve_exe_path(exe.as_deref().ok(), &path);

                games.push(Game {
                    id: game_id,
                    name,
                    provider: "gog",
                    install_dir: Some(path),
                    exe_path: Some(exe_path.to_string_lossy().to_string()),
                    // GOG's entire storefront policy is DRM-free — safe
                    // to assert outright, unlike Steam/Epic where DRM
                    // varies per-title (see decision 0008).
                    drm: DrmRecord::drm_free(
                        "gog",
                        DrmDeterminationMethod::GogImport,
                        super::GOG_POLICY_VERIFIED_ON,
                    ),
                });
            }
        }

        games
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_image_url, GogProductResponse};
    #[cfg(target_os = "windows")]
    use super::resolve_exe_path;

    #[test]
    fn normalize_image_url_adds_https_to_protocol_relative_urls() {
        assert_eq!(
            normalize_image_url("//images-4.gog-statics.com/cover.jpg"),
            "https://images-4.gog-statics.com/cover.jpg"
        );
    }

    #[test]
    fn normalize_image_url_leaves_absolute_urls_unchanged() {
        assert_eq!(
            normalize_image_url("https://images-4.gog-statics.com/cover.jpg"),
            "https://images-4.gog-statics.com/cover.jpg"
        );
    }

    #[test]
    fn parses_gog_product_response_background_image() {
        let json = r#"{
            "id": 1207664643,
            "title": "The Witcher 3: Wild Hunt - Complete Edition",
            "images": {
                "background": "//images-4.gog-statics.com/witcher3.jpg",
                "logo": "//images-1.gog-statics.com/witcher3_logo.jpg"
            }
        }"#;
        let parsed: GogProductResponse = serde_json::from_str(json).unwrap();
        assert_eq!(
            parsed.images.unwrap().background.as_deref(),
            Some("//images-4.gog-statics.com/witcher3.jpg")
        );
    }

    #[test]
    fn parses_gog_product_response_missing_images_as_none() {
        let json = r#"{ "id": 1, "title": "No Images Field" }"#;
        let parsed: GogProductResponse = serde_json::from_str(json).unwrap();
        assert!(parsed.images.is_none());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn relative_exe_joins_onto_install_path() {
        let resolved = resolve_exe_path(Some("game.exe"), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame\\game.exe"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn absolute_exe_is_used_as_is() {
        let resolved = resolve_exe_path(Some("D:\\Elsewhere\\game.exe"), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("D:\\Elsewhere\\game.exe"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn missing_exe_falls_back_to_install_path() {
        let resolved = resolve_exe_path(None, "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn empty_exe_falls_back_to_install_path() {
        let resolved = resolve_exe_path(Some(""), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame"));
    }
}
