pub mod epic;
pub mod gog;
pub mod steam;

use serde::Serialize;

/// Whether a detected game is known to be DRM-free. This is a
/// storefront-level default, not a verified per-title fact — see
/// decision 0008. GOG's DRM-free-by-policy status is safe to assert
/// outright; Steam/Epic DRM varies per-title and there is no legally
/// clean per-title data source yet (PCGamingWiki's list is CC
/// BY-NC-SA, ruled out for this use), so those default to `Unknown`
/// rather than guessing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum DrmStatus {
    #[serde(rename = "drm-free")]
    DrmFree,
    // No provider currently has a verified per-title source to assert
    // this positively (as opposed to defaulting to Unknown) — it's
    // part of the state space this type represents, not dead API
    // surface, and will be constructed once decision 0008's dataset
    // exists.
    #[allow(dead_code)]
    #[serde(rename = "drm")]
    Drm,
    #[serde(rename = "unknown")]
    Unknown,
}

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
    pub drm_status: DrmStatus,
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
    vec![
        Box::new(steam::SteamProvider),
        Box::new(gog::GogProvider),
        Box::new(epic::EpicProvider),
    ]
}
