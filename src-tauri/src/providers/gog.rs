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

#[cfg(target_os = "windows")]
mod windows {
    use super::Game;
    use std::path::Path;
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

                let exe_path = match exe {
                    Ok(exe) if !exe.is_empty() => {
                        let exe_path = Path::new(&exe);
                        if exe_path.is_absolute() {
                            exe_path.to_path_buf()
                        } else {
                            Path::new(&path).join(exe_path)
                        }
                    }
                    _ => Path::new(&path).to_path_buf(),
                };

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
