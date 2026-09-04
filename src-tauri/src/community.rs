//! Client for the community DRM-status verification service
//! (`drmfree-community`, a private repo per decision 0011 — see that
//! repo's README for why the backend itself isn't open, even though
//! this client is). A storefront's own "DRM-free" claim is exactly
//! that, a claim; this lets players confirm or dispute it from
//! firsthand experience and surfaces the aggregate back into the UI.
//!
//! `COMMUNITY_API_URL` is baked in at compile time (like an affiliate
//! tag would be, decision 0011) via `option_env!`, not read at
//! runtime — unset in ordinary `cargo build`/dev, so the feature is a
//! silent no-op until a real deployment sets it in CI. This mirrors
//! the PostHog-key pattern in `src/lib/analytics.ts`: the client code
//! ships either way, it just has nowhere to send/read data without a
//! configured endpoint.

use serde::{Deserialize, Serialize};

fn community_api_url() -> Option<&'static str> {
    option_env!("COMMUNITY_API_URL")
}

// Optional `user:pass`, compile-time baked the same way as the URL
// itself. Exists for cheap early deployments sitting behind HTTP
// Basic Auth (a free-tier ngrok tunnel, a bare VPS with nginx
// basic_auth) — not meant as this feature's long-term access model,
// just enough to test/host before something sturdier is worth setting
// up.
fn community_api_basic_auth() -> Option<(&'static str, &'static str)> {
    let raw = option_env!("COMMUNITY_API_BASIC_AUTH")?;
    raw.split_once(':')
}

fn apply_basic_auth(builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match community_api_basic_auth() {
        Some((user, pass)) => builder.basic_auth(user, Some(pass)),
        None => builder,
    }
}

/// A single report's vote on one freedom-test axis — two-state, unlike
/// `AxisResult` (decision 0024's `drm_axes.rs`): nobody submits a vote
/// of "unknown," that's just the absence of a report, not a report
/// saying "unknown." Aggregation (turning many votes into per-axis
/// pass/fail/total counts) happens server-side in `drmfree-community`;
/// this project only ever sends/receives raw votes and raw counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AxisVote {
    Pass,
    Fail,
}

/// A report's votes across any subset of the eleven axes — every field
/// optional because a report can speak to as many or as few axes as
/// the reporter actually tested. Field names deliberately match
/// `DrmAxes`'s in `drm_axes.rs` one-for-one so the two schemas don't
/// drift into two different naming schemes for the same eleven tests.
#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize)]
pub struct AxisVotes {
    pub first_launch_offline: Option<AxisVote>,
    pub continued_offline_play: Option<AxisVote>,
    pub no_publisher_account: Option<AxisVote>,
    pub no_storefront_account: Option<AxisVote>,
    pub no_storefront_client: Option<AxisVote>,
    pub no_launcher: Option<AxisVote>,
    pub copyable_install: Option<AxisVote>,
    pub reinstallable_from_offline_media: Option<AxisVote>,
    pub no_publisher_auth_servers: Option<AxisVote>,
    pub no_third_party_services: Option<AxisVote>,
    pub no_server_dependent_core_features: Option<AxisVote>,
}

#[derive(Debug, Serialize)]
struct SubmitReportBody<'a> {
    provider: &'a str,
    #[serde(rename = "gameId")]
    game_id: &'a str,
    title: &'a str,
    status: &'a str,
    note: Option<&'a str>,
    #[serde(rename = "clientId")]
    client_id: &'a str,
    /// Omitted entirely (not sent as `null`/`{}`) when the caller votes
    /// on no axes at all, so today's plain status-only report keeps
    /// producing exactly the request body it always has.
    #[serde(skip_serializing_if = "Option::is_none")]
    axes: Option<AxisVotes>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CommunityConsensusCounts {
    #[serde(rename = "drm-free")]
    pub drm_free: u32,
    pub drm: u32,
    pub unknown: u32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CommunityNote {
    pub status: String,
    pub note: String,
}

/// Raw pass/fail/total vote counts for one axis — deliberately not
/// collapsed into a single `AxisResult` here. Just like the existing
/// `counts`/`deriveCommunityDrmStatus` split, applying the minimum-
/// reports/majority-ratio threshold is client-side logic
/// (`drmAxesConsensus.ts`), not something the backend decides.
#[derive(Debug, Default, Clone, Copy, Deserialize, Serialize)]
pub struct AxisCounts {
    pub pass: u32,
    pub fail: u32,
    pub total: u32,
}

/// Per-axis raw counts, one field per test — mirrors `AxisVotes`'s
/// field names/order exactly.
#[derive(Debug, Default, Clone, Copy, Deserialize, Serialize)]
pub struct AxisConsensusCounts {
    pub first_launch_offline: AxisCounts,
    pub continued_offline_play: AxisCounts,
    pub no_publisher_account: AxisCounts,
    pub no_storefront_account: AxisCounts,
    pub no_storefront_client: AxisCounts,
    pub no_launcher: AxisCounts,
    pub copyable_install: AxisCounts,
    pub reinstallable_from_offline_media: AxisCounts,
    pub no_publisher_auth_servers: AxisCounts,
    pub no_third_party_services: AxisCounts,
    pub no_server_dependent_core_features: AxisCounts,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CommunityConsensus {
    pub total: u32,
    pub counts: CommunityConsensusCounts,
    #[serde(rename = "recentNotes")]
    pub recent_notes: Vec<CommunityNote>,
    /// Defaults to all-zero counts rather than failing to parse when
    /// an older `drmfree-community` deployment hasn't been upgraded to
    /// return this field yet.
    #[serde(default)]
    pub axes: AxisConsensusCounts,
}

/// Submits a community DRM-status report. Returns an error naming the
/// missing configuration when no community backend is set up — the
/// frontend is expected to treat that as "hide the feature," not
/// surface it as a user-facing failure (see community.ts).
#[tauri::command]
pub async fn submit_drm_report(
    provider: String,
    game_id: String,
    title: String,
    status: String,
    note: Option<String>,
    client_id: String,
    axes: Option<AxisVotes>,
) -> Result<(), String> {
    let Some(base_url) = community_api_url() else {
        return Err("community reporting is not configured in this build".to_string());
    };

    let client = crate::http::client();
    let request = apply_basic_auth(client.post(format!("{base_url}/reports"))).json(&SubmitReportBody {
        provider: &provider,
        game_id: &game_id,
        title: &title,
        status: &status,
        note: note.as_deref(),
        client_id: &client_id,
        axes,
    });
    let response = request
        .send()
        .await
        .map_err(|e| format!("failed to reach community service: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("community service rejected the report ({status}): {body}"));
    }
    Ok(())
}

/// Fetches the community consensus for a title. Returns `Ok(None)`
/// (not an error) when no community backend is configured, so the
/// frontend can simply not render the widget rather than showing an
/// error state for a feature that was never turned on.
#[tauri::command]
pub async fn get_community_consensus(
    provider: String,
    game_id: String,
) -> Result<Option<CommunityConsensus>, String> {
    let Some(base_url) = community_api_url() else {
        return Ok(None);
    };

    let client = crate::http::client();
    let response = apply_basic_auth(client.get(format!("{base_url}/consensus/{provider}/{game_id}")))
        .send()
        .await
        .map_err(|e| format!("failed to reach community service: {e}"))?
        .error_for_status()
        .map_err(|e| format!("community service returned an error: {e}"))?;

    let consensus: CommunityConsensus = response
        .json()
        .await
        .map_err(|e| format!("failed to parse community service response: {e}"))?;
    Ok(Some(consensus))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submit_report_body_serializes_camel_case_keys() {
        let body = SubmitReportBody {
            provider: "steam",
            game_id: "248820",
            title: "Risk of Rain",
            status: "drm-free",
            note: Some("confirmed"),
            client_id: "abc",
            axes: None,
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(json.contains("\"gameId\":\"248820\""));
        assert!(json.contains("\"clientId\":\"abc\""));
    }

    // A status-only report (no axes tested) must keep sending exactly
    // the request body it always has — no stray "axes":null/{} for a
    // drmfree-community deployment that's never seen the field.
    #[test]
    fn submit_report_body_omits_axes_entirely_when_none() {
        let body = SubmitReportBody {
            provider: "steam",
            game_id: "248820",
            title: "Risk of Rain",
            status: "drm-free",
            note: None,
            client_id: "abc",
            axes: None,
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(!json.contains("axes"));
    }

    #[test]
    fn submit_report_body_serializes_a_partial_axis_vote() {
        let body = SubmitReportBody {
            provider: "steam",
            game_id: "248820",
            title: "Risk of Rain",
            status: "drm-free",
            note: None,
            client_id: "abc",
            axes: Some(AxisVotes {
                first_launch_offline: Some(AxisVote::Pass),
                no_storefront_account: Some(AxisVote::Fail),
                ..Default::default()
            }),
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(json.contains("\"first_launch_offline\":\"pass\""));
        assert!(json.contains("\"no_storefront_account\":\"fail\""));
        assert!(json.contains("\"continued_offline_play\":null"));
    }

    #[test]
    fn consensus_deserializes_from_service_shape() {
        let raw = r#"{
            "provider": "steam",
            "gameId": "248820",
            "total": 2,
            "counts": {"drm-free": 2, "drm": 0, "unknown": 0},
            "recentNotes": [{"status": "drm-free", "note": "works great via GOG"}],
            "axes": {
                "first_launch_offline": {"pass": 2, "fail": 0, "total": 2},
                "continued_offline_play": {"pass": 0, "fail": 0, "total": 0},
                "no_publisher_account": {"pass": 0, "fail": 0, "total": 0},
                "no_storefront_account": {"pass": 0, "fail": 0, "total": 0},
                "no_storefront_client": {"pass": 0, "fail": 0, "total": 0},
                "no_launcher": {"pass": 0, "fail": 0, "total": 0},
                "copyable_install": {"pass": 0, "fail": 0, "total": 0},
                "reinstallable_from_offline_media": {"pass": 0, "fail": 0, "total": 0},
                "no_publisher_auth_servers": {"pass": 0, "fail": 0, "total": 0},
                "no_third_party_services": {"pass": 0, "fail": 0, "total": 0},
                "no_server_dependent_core_features": {"pass": 0, "fail": 0, "total": 0}
            }
        }"#;
        let parsed: CommunityConsensus = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.total, 2);
        assert_eq!(parsed.counts.drm_free, 2);
        assert_eq!(parsed.recent_notes.len(), 1);
        assert_eq!(parsed.axes.first_launch_offline.pass, 2);
    }

    // An older drmfree-community deployment that predates this field
    // must not break every consensus fetch — axes defaults to all-zero
    // counts rather than a parse error.
    #[test]
    fn consensus_deserializes_without_axes_field_present() {
        let raw = r#"{
            "provider": "steam",
            "gameId": "248820",
            "total": 2,
            "counts": {"drm-free": 2, "drm": 0, "unknown": 0},
            "recentNotes": []
        }"#;
        let parsed: CommunityConsensus = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.axes.first_launch_offline.total, 0);
    }
}
