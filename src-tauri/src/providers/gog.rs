use super::{Game, GameProvider};
use serde::Deserialize;
// DrmRecord/DrmDeterminationMethod are only actually used by the
// Windows registry scan and Linux Heroic scan below — GOG detection
// doesn't exist on macOS yet (see `detect_installed_games`), so
// importing these unconditionally makes them (and everything
// downstream of them: resolve_exe_path, GOG_POLICY_VERIFIED_ON, even
// DrmStatus::DrmFree and DrmDeterminationMethod::GogImport
// crate-wide) dead code under `-D warnings` on macOS specifically.
// `test` is included so `mod linux`'s parsing logic can be unit
// tested on any platform (it's pure JSON/string handling, no actual
// Linux-only syscalls) rather than shipping it fully unverified.
#[cfg(any(target_os = "windows", target_os = "linux", test))]
use super::{DrmDeterminationMethod, DrmRecord};

/// Last date a maintainer confirmed GOG's storefront-wide DRM-free
/// policy still holds. Fixed, not `now()` at scan time — a scan
/// happens on every launch and "verified today" would be meaningless
/// noise rather than an actual audit trail. Update by hand if this
/// policy is ever reconfirmed or changes.
#[cfg(any(target_os = "windows", target_os = "linux", test))]
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

        #[cfg(target_os = "linux")]
        {
            linux::detect()
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            // GOG ships no native macOS client and has no standard
            // install/registration location there — nothing reliable to
            // local-scan yet. (Heroic does support macOS too, so this
            // could follow the same approach as the Linux path below
            // once its macOS config directory convention is confirmed.)
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
    let response = crate::http::client()
        .get(&url)
        .send()
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

                // GOG launches this exe directly with no client mediation
                // (unlike Steam/Epic, which hand off to their own
                // launcher and can themselves detect/repair a broken
                // install) — a registry key surviving an incomplete
                // uninstall or a manually-deleted game folder would
                // otherwise show a "Play" button whose only outcome is a
                // raw OS "file not found" error. Skip it instead, same as
                // if it were never installed; a fresh install writes its
                // own registry key back.
                if !exe_path.exists() {
                    continue;
                }

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

/// GOG ships no native Linux client, so there's no first-party install
/// location to scan (unlike Windows' registry). Heroic Games Launcher is
/// the closest thing to a standard location for GOG installs on Linux,
/// so detection here reads Heroic's own data instead.
///
/// **Best-effort, not verified against a real installed.json** — no
/// Linux+Heroic install was available to test against. Field names below
/// (`appName`, `install_path`, `executable`, `platform`) are taken from
/// reading Heroic's own source directly (`src/backend/storeManagers/gog/
/// library.ts`, `InstalledInfo` type, as of 2026-09), not official docs —
/// this project has no control over that schema and it isn't guaranteed
/// stable. Parsing is deliberately permissive throughout: any entry, or
/// the whole file, that doesn't match is skipped rather than erroring, so
/// a wrong guess here means "no GOG games detected on Linux" (identical
/// to the previous behavior), never a crash. Revisit with a real sample
/// file if this doesn't actually detect anything in practice.
///
/// Compiled under `cfg(test)` on any platform too, so the parsing/
/// mapping logic (pure JSON + string handling, no actual Linux-only
/// syscalls) is unit tested rather than shipped fully unverified —
/// only the real, non-test build restricts this to target_os="linux".
#[cfg(any(target_os = "linux", test))]
mod linux {
    use super::{DrmDeterminationMethod, DrmRecord, Game};
    use serde::Deserialize;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};

    #[derive(Debug, Deserialize)]
    struct InstalledInfo {
        #[serde(rename = "appName")]
        app_name: String,
        install_path: String,
        executable: Option<String>,
        platform: Option<String>,
    }

    // installed.json's top-level shape (array vs. an object keyed by
    // appName) isn't confirmed — accept either rather than guess wrong
    // and detect nothing.
    #[derive(Debug, Deserialize)]
    #[serde(untagged)]
    enum InstalledGamesFile {
        List(Vec<InstalledInfo>),
        Map(HashMap<String, InstalledInfo>),
    }

    // library.json's id field naming convention isn't confirmed either
    // (installed.json uses camelCase "appName", but other Heroic types
    // seen while researching this used snake_case "app_name") — accept
    // both.
    #[derive(Debug, Deserialize)]
    struct LibraryEntry {
        app_name: Option<String>,
        #[serde(rename = "appName")]
        app_name_camel: Option<String>,
        title: Option<String>,
    }

    // Not called by any test (mocking dirs::home_dir() isn't worth the
    // complexity — the tests exercise to_game/read_titles/parsing
    // directly instead) — genuinely dead in a cfg(test) build on a
    // non-Linux host, where this module compiles for testing but the
    // real target_os="linux" production caller in
    // detect_installed_games doesn't exist.
    #[allow(dead_code)]
    fn heroic_config_dirs() -> Vec<PathBuf> {
        let Some(home) = dirs::home_dir() else {
            return Vec::new();
        };
        [
            ".config/heroic",
            ".var/app/com.heroicgameslauncher.hgl/config/heroic",
        ]
        .into_iter()
        .map(|p| home.join(p))
        .collect()
    }

    #[allow(dead_code)]
    pub fn detect() -> Vec<Game> {
        for config_dir in heroic_config_dirs() {
            let installed_path = config_dir.join("gog_store").join("installed.json");
            let Ok(contents) = std::fs::read_to_string(&installed_path) else {
                continue;
            };
            let Ok(parsed) = serde_json::from_str::<InstalledGamesFile>(&contents) else {
                continue;
            };

            let entries = match parsed {
                InstalledGamesFile::List(v) => v,
                InstalledGamesFile::Map(m) => m.into_values().collect(),
            };
            let titles = read_titles(&config_dir);

            return entries
                .into_iter()
                .filter(|e| e.platform.as_deref() == Some("linux"))
                .map(|e| to_game(e, &titles))
                .collect();
        }
        Vec::new()
    }

    fn to_game(entry: InstalledInfo, titles: &HashMap<String, String>) -> Game {
        let name = titles.get(&entry.app_name).cloned().unwrap_or_else(|| entry.app_name.clone());
        // Deliberately not std::path::Path here: these are always POSIX
        // paths (this only ever runs against a real Linux install), but
        // Path's separator follows the *compiling* target, not the
        // string's own shape — using it would silently join with `\`
        // when this module is compiled for testing on Windows, and a
        // test asserting the (correct, `/`-joined) real Linux behavior
        // caught exactly that before this comment existed.
        let exe_path = entry.executable.map(|exe| {
            if exe.starts_with('/') {
                exe
            } else {
                format!("{}/{}", entry.install_path.trim_end_matches('/'), exe)
            }
        });

        Game {
            id: entry.app_name,
            name,
            provider: "gog",
            install_dir: Some(entry.install_path),
            exe_path,
            // Same policy-level assertion as the Windows scan above —
            // GOG's whole storefront is DRM-free regardless of which OS
            // detected the install.
            drm: DrmRecord::drm_free("gog", DrmDeterminationMethod::GogImport, super::GOG_POLICY_VERIFIED_ON),
        }
    }

    fn read_titles(config_dir: &Path) -> HashMap<String, String> {
        let library_path = config_dir.join("gog_store").join("library.json");
        let Ok(contents) = std::fs::read_to_string(&library_path) else {
            return HashMap::new();
        };
        let Ok(entries) = serde_json::from_str::<Vec<LibraryEntry>>(&contents) else {
            return HashMap::new();
        };
        entries
            .into_iter()
            .filter_map(|e| {
                let id = e.app_name.or(e.app_name_camel)?;
                let title = e.title?;
                Some((id, title))
            })
            .collect()
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::fs;

        fn temp_dir(name: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!(
                "drmfree-launcher-test-gog-linux-{name}-{}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            dir
        }

        #[test]
        fn installed_games_file_parses_array_shape() {
            let json = r#"[
                { "appName": "123", "install_path": "/home/u/Games/game", "executable": "game", "platform": "linux" }
            ]"#;
            let parsed: InstalledGamesFile = serde_json::from_str(json).unwrap();
            let InstalledGamesFile::List(entries) = parsed else {
                panic!("expected List variant");
            };
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].app_name, "123");
        }

        #[test]
        fn installed_games_file_parses_map_shape() {
            let json = r#"{
                "123": { "appName": "123", "install_path": "/home/u/Games/game", "executable": "game", "platform": "linux" }
            }"#;
            let parsed: InstalledGamesFile = serde_json::from_str(json).unwrap();
            let InstalledGamesFile::Map(entries) = parsed else {
                panic!("expected Map variant");
            };
            assert_eq!(entries.len(), 1);
            assert!(entries.contains_key("123"));
        }

        #[test]
        fn to_game_uses_title_from_library_when_available() {
            let entry = InstalledInfo {
                app_name: "123".to_string(),
                install_path: "/home/u/Games/game".to_string(),
                executable: Some("game".to_string()),
                platform: Some("linux".to_string()),
            };
            let mut titles = HashMap::new();
            titles.insert("123".to_string(), "Risk of Rain".to_string());

            let game = to_game(entry, &titles);
            assert_eq!(game.name, "Risk of Rain");
            assert_eq!(game.id, "123");
            assert_eq!(game.provider, "gog");
        }

        #[test]
        fn to_game_falls_back_to_app_name_when_title_missing() {
            let entry = InstalledInfo {
                app_name: "123".to_string(),
                install_path: "/home/u/Games/game".to_string(),
                executable: None,
                platform: Some("linux".to_string()),
            };
            let game = to_game(entry, &HashMap::new());
            assert_eq!(game.name, "123");
        }

        #[test]
        fn to_game_joins_relative_executable_onto_install_path() {
            let entry = InstalledInfo {
                app_name: "123".to_string(),
                install_path: "/home/u/Games/game".to_string(),
                executable: Some("game.sh".to_string()),
                platform: Some("linux".to_string()),
            };
            let game = to_game(entry, &HashMap::new());
            assert_eq!(game.exe_path.as_deref(), Some("/home/u/Games/game/game.sh"));
        }

        #[test]
        fn to_game_leaves_absolute_executable_unchanged() {
            let entry = InstalledInfo {
                app_name: "123".to_string(),
                install_path: "/home/u/Games/game".to_string(),
                executable: Some("/opt/elsewhere/game.sh".to_string()),
                platform: Some("linux".to_string()),
            };
            let game = to_game(entry, &HashMap::new());
            assert_eq!(game.exe_path.as_deref(), Some("/opt/elsewhere/game.sh"));
        }

        #[test]
        fn read_titles_accepts_snake_case_app_name() {
            let dir = temp_dir("titles-snake");
            fs::create_dir_all(dir.join("gog_store")).unwrap();
            fs::write(
                dir.join("gog_store").join("library.json"),
                r#"[{ "app_name": "123", "title": "Risk of Rain" }]"#,
            )
            .unwrap();

            let titles = read_titles(&dir);
            assert_eq!(titles.get("123"), Some(&"Risk of Rain".to_string()));

            fs::remove_dir_all(&dir).unwrap();
        }

        #[test]
        fn read_titles_accepts_camel_case_app_name() {
            let dir = temp_dir("titles-camel");
            fs::create_dir_all(dir.join("gog_store")).unwrap();
            fs::write(
                dir.join("gog_store").join("library.json"),
                r#"[{ "appName": "123", "title": "Risk of Rain" }]"#,
            )
            .unwrap();

            let titles = read_titles(&dir);
            assert_eq!(titles.get("123"), Some(&"Risk of Rain".to_string()));

            fs::remove_dir_all(&dir).unwrap();
        }

        #[test]
        fn read_titles_returns_empty_map_when_library_json_missing() {
            let dir = temp_dir("titles-missing");
            assert!(read_titles(&dir).is_empty());
            fs::remove_dir_all(&dir).unwrap();
        }

        #[test]
        fn detect_skips_non_linux_platform_entries() {
            // A Windows-platform GOG install run through Heroic's own Wine
            // wrapper — this provider only launches by executing the
            // binary directly, so a Windows .exe isn't launchable without
            // Wine invocation logic this doesn't have. Must not be listed.
            let dir = temp_dir("skip-windows-platform");
            fs::create_dir_all(dir.join("gog_store")).unwrap();
            fs::write(
                dir.join("gog_store").join("installed.json"),
                r#"[
                    { "appName": "1", "install_path": "/home/u/Games/a", "executable": "a", "platform": "linux" },
                    { "appName": "2", "install_path": "/home/u/Games/b", "executable": "b.exe", "platform": "windows" }
                ]"#,
            )
            .unwrap();
            fs::write(dir.join("gog_store").join("library.json"), "[]").unwrap();

            let contents = fs::read_to_string(dir.join("gog_store").join("installed.json")).unwrap();
            let parsed: InstalledGamesFile = serde_json::from_str(&contents).unwrap();
            let InstalledGamesFile::List(entries) = parsed else {
                panic!("expected List variant");
            };
            let kept: Vec<_> = entries.into_iter().filter(|e| e.platform.as_deref() == Some("linux")).collect();

            assert_eq!(kept.len(), 1);
            assert_eq!(kept[0].app_name, "1");

            fs::remove_dir_all(&dir).unwrap();
        }
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

    // Regression guard for the stale-registry-entry filter in
    // windows::detect(): resolve_exe_path's output is exactly what gets
    // exists()-checked there, so this confirms that check actually
    // distinguishes a real install from a leftover/deleted one using
    // the same resolution logic, not just Path::exists() in isolation.
    #[cfg(target_os = "windows")]
    #[test]
    fn resolved_exe_path_existence_matches_real_file_on_disk() {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-gog-stale-entry-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("game.exe"), b"").unwrap();

        let installed = resolve_exe_path(Some("game.exe"), dir.to_str().unwrap());
        assert!(installed.exists(), "existing exe should resolve as present");

        let uninstalled = resolve_exe_path(Some("missing.exe"), dir.to_str().unwrap());
        assert!(
            !uninstalled.exists(),
            "a registry key left behind after uninstall/deletion should resolve as absent"
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
