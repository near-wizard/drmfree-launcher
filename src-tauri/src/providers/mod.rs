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

/// How a `DrmRecord`'s status was determined. This is provenance, not
/// display copy — decision 0008 exists precisely because "DRM-free"
/// alone doesn't say whether that's a verified per-title fact or a
/// storefront-level default, and future sources (a real independently-
/// compiled dataset, a direct publisher deal) need to be tellable apart
/// from each other and from today's blanket GOG-storefront assumption.
///
/// Only `GogImport` is actually constructed anywhere today; the rest
/// are here so `DrmRecord` doesn't need a breaking shape change once
/// decision 0008's dataset (or a publisher/community source) exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DrmDeterminationMethod {
    /// Inferred from a storefront's own known-DRM-free policy at
    /// import time (e.g. "GOG is DRM-free") — not a per-title check.
    GogImport,
    #[allow(dead_code)]
    /// The publisher/developer states DRM-free status themselves
    /// (store page copy, press kit, direct statement).
    PublisherDeclared,
    #[allow(dead_code)]
    /// Sourced from a community-maintained dataset — the
    /// independently-compiled open dataset decision 0008 anticipates,
    /// not PCGamingWiki's list (ruled out there on licensing grounds).
    CommunityReview,
    #[allow(dead_code)]
    /// A maintainer of this project checked the title by hand.
    ManualReview,
}

/// A DRM status plus where it came from. `source` and `method` are
/// `None` together iff `status` is `Unknown` — there's nothing to cite
/// when no determination was made at all.
#[derive(Debug, Clone, Serialize)]
pub struct DrmRecord {
    pub status: DrmStatus,
    /// Free-form provenance label (e.g. "gog"), not an enum — decision
    /// 0008 anticipates sources that shouldn't require a type change
    /// here to add (a dataset name, a publisher name, ...).
    pub source: Option<String>,
    pub method: Option<DrmDeterminationMethod>,
}

impl DrmRecord {
    pub fn unknown() -> Self {
        DrmRecord {
            status: DrmStatus::Unknown,
            source: None,
            method: None,
        }
    }

    pub fn drm_free(source: impl Into<String>, method: DrmDeterminationMethod) -> Self {
        DrmRecord {
            status: DrmStatus::DrmFree,
            source: Some(source.into()),
            method: Some(method),
        }
    }
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
    pub drm: DrmRecord,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_record_has_no_source_or_method() {
        let record = DrmRecord::unknown();
        assert_eq!(record.status, DrmStatus::Unknown);
        assert_eq!(record.source, None);
        assert_eq!(record.method, None);
    }

    #[test]
    fn drm_free_record_carries_source_and_method() {
        let record = DrmRecord::drm_free("gog", DrmDeterminationMethod::GogImport);
        assert_eq!(record.status, DrmStatus::DrmFree);
        assert_eq!(record.source.as_deref(), Some("gog"));
        assert_eq!(record.method, Some(DrmDeterminationMethod::GogImport));
    }

    // Locks in the exact wire shape the frontend depends on — a field
    // rename here would silently break `src/types/game.ts` without
    // this test failing.
    #[test]
    fn drm_record_serializes_with_snake_case_method_and_named_fields() {
        let record = DrmRecord::drm_free("gog", DrmDeterminationMethod::GogImport);
        let json = serde_json::to_value(&record).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "status": "drm-free",
                "source": "gog",
                "method": "gog_import",
            })
        );
    }

    #[test]
    fn unknown_record_serializes_source_and_method_as_null() {
        let json = serde_json::to_value(DrmRecord::unknown()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "status": "unknown",
                "source": null,
                "method": null,
            })
        );
    }
}
