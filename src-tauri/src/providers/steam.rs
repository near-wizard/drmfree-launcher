use super::{Game, GameProvider};
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
fn library_folders(steam_root: &Path) -> Vec<PathBuf> {
    let default_lib = steam_root.join("steamapps");
    let vdf_path = default_lib.join("libraryfolders.vdf");

    let Ok(contents) = fs::read_to_string(&vdf_path) else {
        return vec![default_lib];
    };

    let mut libraries = vec![default_lib];
    for value in extract_quoted_values(&contents, "path") {
        let lib = PathBuf::from(value).join("steamapps");
        if lib.exists() && !libraries.contains(&lib) {
            libraries.push(lib);
        }
    }
    libraries
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
