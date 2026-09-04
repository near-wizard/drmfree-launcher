pub mod epic;
pub mod gog;
pub mod humble;
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
    // Only constructed by gog.rs's Windows-only registry scan today —
    // GOG detection doesn't exist on other platforms yet, so this is
    // genuinely dead code on non-Windows builds specifically (not
    // reachable outside #[cfg(test)], which is its own compilation
    // target and doesn't save it). Will stop needing this once GOG
    // detection or another DRM-free source works cross-platform.
    #[allow(dead_code)]
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
/// `StorefrontImport` is the only one actually constructed anywhere
/// today (by both gog.rs and humble.rs — both storefronts sell their
/// whole catalog DRM-free by policy); the rest are here so `DrmRecord`
/// doesn't need a breaking shape change once decision 0008's dataset
/// (or a publisher/community source) exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DrmDeterminationMethod {
    /// Inferred from a storefront's own known-DRM-free policy at
    /// import time (e.g. "GOG is DRM-free", "Humble Bundle is
    /// DRM-free") — not a per-title check. Named generically rather
    /// than after GOG specifically (its first user) precisely so a
    /// second storefront could reuse it without a misleading label —
    /// see decision 0020.
    // Same non-Windows dead-code situation as DrmStatus::DrmFree above:
    // only constructed by gog.rs's Windows-only registry scan and
    // humble.rs.
    #[allow(dead_code)]
    StorefrontImport,
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

/// A DRM status plus where it came from. `source`, `method`, and
/// `verified_on` are all `None` together iff `status` is `Unknown` —
/// there's nothing to cite when no determination was made at all.
#[derive(Debug, Clone, Serialize)]
pub struct DrmRecord {
    pub status: DrmStatus,
    /// Free-form provenance label (e.g. "gog"), not an enum — decision
    /// 0008 anticipates sources that shouldn't require a type change
    /// here to add (a dataset name, a publisher name, ...).
    pub source: Option<String>,
    pub method: Option<DrmDeterminationMethod>,
    /// ISO 8601 date (`YYYY-MM-DD`) the determination was last checked
    /// as still accurate — not when the `Game` was scanned, which
    /// happens on every launch and would make "verified" meaningless.
    /// A plain string rather than a date type: this project has no
    /// date/time dependency elsewhere, and nothing here parses or does
    /// arithmetic on it — it's a citation, not a computed value.
    pub verified_on: Option<String>,
}

impl DrmRecord {
    pub fn unknown() -> Self {
        DrmRecord {
            status: DrmStatus::Unknown,
            source: None,
            method: None,
            verified_on: None,
        }
    }

    // Same non-Windows dead-code situation as DrmStatus::DrmFree above:
    // only called by gog.rs's Windows-only registry scan outside tests.
    #[allow(dead_code)]
    pub fn drm_free(
        source: impl Into<String>,
        method: DrmDeterminationMethod,
        verified_on: impl Into<String>,
    ) -> Self {
        DrmRecord {
            status: DrmStatus::DrmFree,
            source: Some(source.into()),
            method: Some(method),
            verified_on: Some(verified_on.into()),
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
    /// Provider-specific launch target: a direct exe path for
    /// DRM-free providers, or (for Epic) the composite
    /// `namespace:catalogItemId:appName` id its protocol handler
    /// actually matches against — not a filesystem path there despite
    /// the field name. `None` when launch uses `id` alone, as with
    /// Steam's `steam://rungameid/<id>` handoff.
    pub exe_path: Option<String>,
    /// A real filesystem path to the installed executable, used only as
    /// a last-resort cover-art source (extracting the exe's own icon) —
    /// distinct from `exe_path` because for Epic that field is already
    /// spoken for by the protocol-handler composite id, not a real path.
    /// Steam and GOG already have working cover-art lookups (a CDN guess
    /// and an exact product-ID API call respectively) so they leave this
    /// `None`; only Epic populates it today.
    pub icon_source: Option<String>,
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
        Box::new(humble::HumbleProvider),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_record_has_no_source_method_or_verified_date() {
        let record = DrmRecord::unknown();
        assert_eq!(record.status, DrmStatus::Unknown);
        assert_eq!(record.source, None);
        assert_eq!(record.method, None);
        assert_eq!(record.verified_on, None);
    }

    #[test]
    fn drm_free_record_carries_source_method_and_verified_date() {
        let record = DrmRecord::drm_free("gog", DrmDeterminationMethod::StorefrontImport, "2026-09-02");
        assert_eq!(record.status, DrmStatus::DrmFree);
        assert_eq!(record.source.as_deref(), Some("gog"));
        assert_eq!(record.method, Some(DrmDeterminationMethod::StorefrontImport));
        assert_eq!(record.verified_on.as_deref(), Some("2026-09-02"));
    }

    // Locks in the exact wire shape the frontend depends on — a field
    // rename here would silently break `src/types/game.ts` without
    // this test failing.
    #[test]
    fn drm_record_serializes_with_snake_case_method_and_named_fields() {
        let record = DrmRecord::drm_free("gog", DrmDeterminationMethod::StorefrontImport, "2026-09-02");
        let json = serde_json::to_value(&record).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "status": "drm-free",
                "source": "gog",
                "method": "storefront_import",
                "verified_on": "2026-09-02",
            })
        );
    }

    #[test]
    fn unknown_record_serializes_source_method_and_verified_date_as_null() {
        let json = serde_json::to_value(DrmRecord::unknown()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "status": "unknown",
                "source": null,
                "method": null,
                "verified_on": null,
            })
        );
    }
}
