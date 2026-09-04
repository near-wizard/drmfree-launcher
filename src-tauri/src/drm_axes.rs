//! Granular, falsifiable freedom tests — a deliberate companion to
//! `DrmRecord`, not a replacement for it. `DrmRecord` answers one
//! collapsed question ("is this DRM-free, and by what determination");
//! this answers eleven separate, individually-testable ones, because
//! a title can pass some real freedom tests and fail others without
//! that nuance surviving a single enum (a game can need one-time
//! online activation and still be otherwise fully portable — that's
//! not "DRM-free" and it's not "DRM" either, it's a specific fact
//! worth keeping specific). See decision 0024.
//!
//! Deliberately not attempting to collapse these into named tiers —
//! that's a real design question (which combinations mean what) this
//! project isn't answering yet, possibly ever. What's stored is only
//! what was actually tested.

use serde::{Deserialize, Serialize};

/// Same three-state shape as `DrmStatus` and for the same reason:
/// "untested" must be distinguishable from "tested and fails" — a
/// blank axis isn't evidence of anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AxisResult {
    Pass,
    Fail,
    Unknown,
}

/// The eleven freedom tests, grouped into five dimensions. Field order
/// matches the grouping, not alphabetical — this is read by humans as
/// a checklist more often than it's iterated by code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DrmAxes {
    // A — Network independence
    /// A1: can a freshly installed copy launch without internet access?
    pub first_launch_offline: AxisResult,
    /// A2: can the game be played indefinitely without ever reconnecting?
    pub continued_offline_play: AxisResult,

    // B — Account independence
    /// B1: can it be played without creating/logging into a publisher account?
    pub no_publisher_account: AxisResult,
    /// B2: can it be played without a storefront (Steam/Epic/...) account?
    pub no_storefront_account: AxisResult,

    // C — Client independence
    /// C1: can the executable launch without a storefront client running?
    pub no_storefront_client: AxisResult,
    /// C2: can it launch directly from the installed files, no launcher at all?
    pub no_launcher: AxisResult,

    // D — Installation portability
    /// D1: can the installed directory be copied to another machine and run?
    pub copyable_install: AxisResult,
    /// D2: can it be fully reinstalled using only the distributed offline files?
    pub reinstallable_from_offline_media: AxisResult,

    // E — External-service independence
    /// E1: does gameplay require any publisher-operated authentication service?
    pub no_publisher_auth_servers: AxisResult,
    /// E2: does gameplay require servers operated by any third party?
    pub no_third_party_services: AxisResult,
    /// E3: are core (non-optional-multiplayer) gameplay features
    /// functional with no external servers at all?
    pub no_server_dependent_core_features: AxisResult,
}

impl DrmAxes {
    /// The default for every game until someone actually reports on
    /// it — same "no data isn't evidence of DRM" caution as
    /// `DrmRecord::unknown()`. Not called anywhere outside tests yet:
    /// nothing in the Rust backend constructs a populated `DrmAxes`
    /// today (see the doc comment on `Game.drm_axes`), so there's no
    /// production call site needing an explicit "all unknown" value —
    /// kept for the same reason `DrmRecord::drm_free()`'s counterparts
    /// were kept ahead of use elsewhere in this file: symmetry, and a
    /// real call site once a consensus-folding path exists in Rust
    /// too, not just the TS mirror.
    #[allow(dead_code)]
    pub fn unknown() -> Self {
        DrmAxes {
            first_launch_offline: AxisResult::Unknown,
            continued_offline_play: AxisResult::Unknown,
            no_publisher_account: AxisResult::Unknown,
            no_storefront_account: AxisResult::Unknown,
            no_storefront_client: AxisResult::Unknown,
            no_launcher: AxisResult::Unknown,
            copyable_install: AxisResult::Unknown,
            reinstallable_from_offline_media: AxisResult::Unknown,
            no_publisher_auth_servers: AxisResult::Unknown,
            no_third_party_services: AxisResult::Unknown,
            no_server_dependent_core_features: AxisResult::Unknown,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_sets_every_axis_to_unknown() {
        let axes = DrmAxes::unknown();
        assert_eq!(axes.first_launch_offline, AxisResult::Unknown);
        assert_eq!(axes.continued_offline_play, AxisResult::Unknown);
        assert_eq!(axes.no_publisher_account, AxisResult::Unknown);
        assert_eq!(axes.no_storefront_account, AxisResult::Unknown);
        assert_eq!(axes.no_storefront_client, AxisResult::Unknown);
        assert_eq!(axes.no_launcher, AxisResult::Unknown);
        assert_eq!(axes.copyable_install, AxisResult::Unknown);
        assert_eq!(axes.reinstallable_from_offline_media, AxisResult::Unknown);
        assert_eq!(axes.no_publisher_auth_servers, AxisResult::Unknown);
        assert_eq!(axes.no_third_party_services, AxisResult::Unknown);
        assert_eq!(axes.no_server_dependent_core_features, AxisResult::Unknown);
    }

    // Locks in the exact wire shape the frontend depends on — a field
    // rename here would silently break src/types/drmAxes.ts without
    // this test failing. Mirrors the equivalent DrmRecord test in
    // providers/mod.rs.
    #[test]
    fn drm_axes_serializes_with_snake_case_fields_and_values() {
        let mut axes = DrmAxes::unknown();
        axes.first_launch_offline = AxisResult::Pass;
        axes.no_storefront_account = AxisResult::Fail;
        let json = serde_json::to_value(axes).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "first_launch_offline": "pass",
                "continued_offline_play": "unknown",
                "no_publisher_account": "unknown",
                "no_storefront_account": "fail",
                "no_storefront_client": "unknown",
                "no_launcher": "unknown",
                "copyable_install": "unknown",
                "reinstallable_from_offline_media": "unknown",
                "no_publisher_auth_servers": "unknown",
                "no_third_party_services": "unknown",
                "no_server_dependent_core_features": "unknown",
            })
        );
    }

    #[test]
    fn drm_axes_round_trips_through_json() {
        let mut axes = DrmAxes::unknown();
        axes.copyable_install = AxisResult::Pass;
        axes.no_third_party_services = AxisResult::Fail;
        let json = serde_json::to_string(&axes).unwrap();
        let back: DrmAxes = serde_json::from_str(&json).unwrap();
        assert_eq!(back, axes);
    }
}
