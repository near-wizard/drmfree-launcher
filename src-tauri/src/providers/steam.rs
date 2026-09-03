use super::{DrmRecord, Game, GameProvider};
use std::fs;
use std::path::{Path, PathBuf};

pub struct SteamProvider;

impl GameProvider for SteamProvider {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn display_name(&self) -> &'static str {
        "Steam"
    }

    fn detect_installed_games(&self) -> Vec<Game> {
        let Some(steam_root) = find_steam_root() else {
            return Vec::new();
        };

        library_folders(&steam_root)
            .iter()
            .flat_map(|lib| games_in_library(lib))
            .collect()
    }

    fn launch(&self, game: &Game) -> Result<(), String> {
        // Native protocol handoff only — Steam itself decides how to
        // launch the game. We never touch the game binary.
        let uri = format!("steam://rungameid/{}", game.id);
        open_uri(&uri)
    }
}

/// Locates the Steam client's install root, per OS. Returns `None` when
/// Steam isn't installed — that's a normal, expected outcome, not an error.
fn find_steam_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        windows_steam_root()
    }

    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|h| h.join("Library/Application Support/Steam"))
    }

    #[cfg(target_os = "linux")]
    {
        linux_steam_root()
    }
    .filter(|p: &PathBuf| p.exists())
}

#[cfg(target_os = "windows")]
fn windows_steam_root() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            return Some(PathBuf::from(path));
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey in ["SOFTWARE\\WOW6432Node\\Valve\\Steam", "SOFTWARE\\Valve\\Steam"] {
        if let Ok(key) = hklm.open_subkey(subkey) {
            if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                return Some(PathBuf::from(path));
            }
        }
    }

    None
}

#[cfg(target_os = "linux")]
fn linux_steam_root() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    [
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".var/app/com.valvesoftware.Steam/data/Steam"),
    ]
    .into_iter()
    .find(|p| p.exists())
}

/// Every library path (default + user-added drives) via
/// `steamapps/libraryfolders.vdf`, falling back to just the root.
///
/// `libraryfolders.vdf` lists the default library's own path alongside
/// any extra ones, so dedup by canonical path — not raw `PathBuf`
/// equality, which misses same-directory entries that differ only in
/// case or slash style (Steam writes the vdf value verbatim from
/// wherever the library was added, which need not match how we joined
/// `steam_root` ourselves) and would otherwise double-scan a library,
/// duplicating every game in it.
fn library_folders(steam_root: &Path) -> Vec<PathBuf> {
    let default_lib = steam_root.join("steamapps");
    let vdf_path = default_lib.join("libraryfolders.vdf");

    let Ok(contents) = fs::read_to_string(&vdf_path) else {
        return vec![default_lib];
    };

    let mut seen_canonical = std::collections::HashSet::new();
    seen_canonical.insert(canonical_or_self(&default_lib));
    let mut libraries = vec![default_lib];

    for value in extract_quoted_values(&contents, "path") {
        let lib = PathBuf::from(value).join("steamapps");
        if !lib.exists() {
            continue;
        }
        if seen_canonical.insert(canonical_or_self(&lib)) {
            libraries.push(lib);
        }
    }
    libraries
}

fn canonical_or_self(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Parses every `appmanifest_*.acf` in a `steamapps` directory into a `Game`.
fn games_in_library(steamapps_dir: &Path) -> Vec<Game> {
    let Ok(entries) = fs::read_dir(steamapps_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with("appmanifest_") && name.ends_with(".acf")
        })
        .filter_map(|e| fs::read_to_string(e.path()).ok())
        .filter_map(|contents| {
            let appid = extract_quoted_values(&contents, "appid").into_iter().next()?;
            let name = extract_quoted_values(&contents, "name").into_iter().next()?;
            let installdir = extract_quoted_values(&contents, "installdir").into_iter().next();
            Some(Game {
                id: appid,
                name,
                provider: "steam",
                install_dir: installdir.map(|d| {
                    steamapps_dir
                        .join("common")
                        .join(d)
                        .to_string_lossy()
                        .to_string()
                }),
                exe_path: None,
                drm: DrmRecord::unknown(),
            })
        })
        .collect()
}

/// Minimal, tolerant reader for Valve's VDF key-value format — good enough
/// for the flat `"key"    "value"` pairs found in .acf/.vdf manifests
/// without pulling in a full VDF parser dependency for Stage 0.
fn extract_quoted_values(contents: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{key}\"");
    contents
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with(&needle) {
                return None;
            }
            let rest = &trimmed[needle.len()..];
            let mut parts = rest.splitn(3, '"');
            parts.next(); // leading whitespace before opening quote
            parts.next() // the value between quotes
        })
        .map(|s| s.to_string())
        .collect()
}

fn open_uri(uri: &str) -> Result<(), String> {
    open::that(uri).map_err(|e| format!("failed to open {uri}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extract_quoted_values_reads_matching_keys_only() {
        let contents = r#"
            "AppState"
            {
                "appid"        "440"
                "universe"        "1"
                "name"        "Team Fortress 2"
            }
        "#;
        assert_eq!(extract_quoted_values(contents, "appid"), vec!["440"]);
        assert_eq!(
            extract_quoted_values(contents, "name"),
            vec!["Team Fortress 2"]
        );
        // A key that's a superstring of another must not false-match.
        assert!(extract_quoted_values(contents, "app").is_empty());
    }

    #[test]
    fn extract_quoted_values_collects_multiple_matches() {
        let contents = r#"
            "path"        "C:\SteamLibrary"
            "path"        "D:\SteamLibrary"
        "#;
        assert_eq!(
            extract_quoted_values(contents, "path"),
            vec!["C:\\SteamLibrary", "D:\\SteamLibrary"]
        );
    }

    #[test]
    fn games_in_library_parses_appmanifest_files() {
        let steamapps = temp_dir("games-in-library");
        fs::write(
            steamapps.join("appmanifest_440.acf"),
            r#"
            "AppState"
            {
                "appid"        "440"
                "name"        "Team Fortress 2"
                "installdir"        "Team Fortress 2"
            }
            "#,
        )
        .unwrap();
        // Non-manifest files must be ignored.
        fs::write(steamapps.join("libraryfolders.vdf"), "\"path\" \"C:\\\\Elsewhere\"").unwrap();

        let games = games_in_library(&steamapps);

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "440");
        assert_eq!(games[0].name, "Team Fortress 2");
        assert_eq!(games[0].provider, "steam");
        assert_eq!(
            games[0].install_dir,
            Some(
                steamapps
                    .join("common")
                    .join("Team Fortress 2")
                    .to_string_lossy()
                    .to_string()
            )
        );

        fs::remove_dir_all(&steamapps).unwrap();
    }

    #[test]
    fn games_in_library_skips_manifests_missing_required_fields() {
        let steamapps = temp_dir("missing-fields");
        fs::write(
            steamapps.join("appmanifest_1.acf"),
            "\"AppState\"\n{\n    \"appid\"    \"1\"\n}\n", // no "name"
        )
        .unwrap();

        assert!(games_in_library(&steamapps).is_empty());

        fs::remove_dir_all(&steamapps).unwrap();
    }

    #[test]
    fn library_folders_falls_back_to_root_when_vdf_missing() {
        let steam_root = temp_dir("no-vdf");
        let libs = library_folders(&steam_root);
        assert_eq!(libs, vec![steam_root.join("steamapps")]);
        fs::remove_dir_all(&steam_root).unwrap();
    }

    #[test]
    fn library_folders_includes_existing_paths_from_vdf() {
        let steam_root = temp_dir("with-vdf");
        let default_lib = steam_root.join("steamapps");
        fs::create_dir_all(&default_lib).unwrap();

        let extra_root = temp_dir("extra-library");
        fs::create_dir_all(extra_root.join("steamapps")).unwrap();

        let vdf = format!(
            "\"libraryfolders\"\n{{\n    \"1\"\n    {{\n        \"path\"        \"{}\"\n    }}\n}}\n",
            extra_root.to_string_lossy().replace('\\', "\\\\")
        );
        fs::write(default_lib.join("libraryfolders.vdf"), vdf).unwrap();

        let libs = library_folders(&steam_root);

        assert_eq!(libs, vec![default_lib.clone(), extra_root.join("steamapps")]);

        fs::remove_dir_all(&steam_root).unwrap();
        fs::remove_dir_all(&extra_root).unwrap();
    }

    #[test]
    fn library_folders_does_not_duplicate_default_library_listed_in_vdf() {
        // Steam's own libraryfolders.vdf lists the default library
        // alongside any extra ones. A prior bug compared raw `PathBuf`s
        // (steam_root.join("steamapps") vs. the vdf's own string form of
        // the same directory) which could disagree in case/slash style
        // and fail to dedup, double-scanning the library and duplicating
        // every game in it.
        let steam_root = temp_dir("vdf-lists-default");
        let default_lib = steam_root.join("steamapps");
        fs::create_dir_all(&default_lib).unwrap();

        let vdf = format!(
            "\"libraryfolders\"\n{{\n    \"0\"\n    {{\n        \"path\"        \"{}\"\n    }}\n}}\n",
            steam_root.to_string_lossy().replace('\\', "\\\\")
        );
        fs::write(default_lib.join("libraryfolders.vdf"), vdf).unwrap();

        let libs = library_folders(&steam_root);

        assert_eq!(libs, vec![default_lib.clone()]);

        fs::remove_dir_all(&steam_root).unwrap();
    }
}
