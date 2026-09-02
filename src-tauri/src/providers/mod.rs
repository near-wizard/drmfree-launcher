pub mod gog;
pub mod steam;

use serde::Serialize;

/// A single locally-installed game, normalized across providers.
#[derive(Debug, Clone, Serialize)]
pub struct Game {
    /// Provider-specific identifier (e.g. Steam's numeric appid).
    pub id: String,
    pub name: String,
    /// Matches `GameProvider::id()` of whichever provider found it.
    pub provider: &'static str,
    pub install_dir: Option<String>,
    /// Provider-specific launch target (e.g. a direct exe path for
    /// DRM-free providers). `None` when launch uses `id` alone, as with
    /// Steam's `steam://rungameid/<id>` handoff.
    pub exe_path: Option<String>,
}

/// Abstraction over "a place games can be installed and launched from".
///
/// Steam is the only implementation in Stage 0, but every other provider
/// (GOG, Epic, ...) plugs in the same way — detection reads local
/// manifests/registry only, launch hands off to a native protocol/URI
/// handler. No provider should ever call a storefront's web API to read
/// account ownership; that's out of scope by design (see project brief).
pub trait GameProvider: Send + Sync {
    /// Stable machine-readable id, e.g. "steam".
    fn id(&self) -> &'static str;

    /// Human-readable name, e.g. "Steam".
    fn display_name(&self) -> &'static str;

    /// Scan the local machine for installed games. Returns an empty list
    /// (not an error) when the provider's client isn't installed at all.
    fn detect_installed_games(&self) -> Vec<Game>;

    /// Hand off launching to the OS/provider's own mechanism (protocol
    /// handler, executable, etc). Never touches game binaries directly.
    fn launch(&self, game: &Game) -> Result<(), String>;
}

/// All providers wired into the app. Add new providers here only.
pub fn all_providers() -> Vec<Box<dyn GameProvider>> {
    vec![Box::new(steam::SteamProvider), Box::new(gog::GogProvider)]
}
