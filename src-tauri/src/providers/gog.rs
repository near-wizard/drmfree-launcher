use super::{Game, GameProvider};

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

/// Resolves a GOG registry entry's `exe` value against its `path` value:
/// absolute exe paths are used as-is, relative ones are joined onto the
/// install path, and a missing/empty exe value falls back to the install
/// path itself.
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
    use super::{resolve_exe_path, Game};
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
                });
            }
        }

        games
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_exe_path;

    #[test]
    fn relative_exe_joins_onto_install_path() {
        let resolved = resolve_exe_path(Some("game.exe"), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame\\game.exe"));
    }

    #[test]
    fn absolute_exe_is_used_as_is() {
        let resolved = resolve_exe_path(Some("D:\\Elsewhere\\game.exe"), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("D:\\Elsewhere\\game.exe"));
    }

    #[test]
    fn missing_exe_falls_back_to_install_path() {
        let resolved = resolve_exe_path(None, "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame"));
    }

    #[test]
    fn empty_exe_falls_back_to_install_path() {
        let resolved = resolve_exe_path(Some(""), "C:\\Games\\MyGame");
        assert_eq!(resolved, std::path::Path::new("C:\\Games\\MyGame"));
    }
}
