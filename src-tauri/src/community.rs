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

#[derive(Debug, Deserialize, Serialize)]
pub struct CommunityConsensus {
    pub total: u32,
    pub counts: CommunityConsensusCounts,
    #[serde(rename = "recentNotes")]
    pub recent_notes: Vec<CommunityNote>,
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
) -> Result<(), String> {
    let Some(base_url) = community_api_url() else {
        return Err("community reporting is not configured in this build".to_string());
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{base_url}/reports"))
        .json(&SubmitReportBody {
            provider: &provider,
            game_id: &game_id,
            title: &title,
            status: &status,
            note: note.as_deref(),
            client_id: &client_id,
        })
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

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{base_url}/consensus/{provider}/{game_id}"))
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
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(json.contains("\"gameId\":\"248820\""));
        assert!(json.contains("\"clientId\":\"abc\""));
    }

    #[test]
    fn consensus_deserializes_from_service_shape() {
        let raw = r#"{
            "provider": "steam",
            "gameId": "248820",
            "total": 2,
            "counts": {"drm-free": 2, "drm": 0, "unknown": 0},
            "recentNotes": [{"status": "drm-free", "note": "works great via GOG"}]
        }"#;
        let parsed: CommunityConsensus = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.total, 2);
        assert_eq!(parsed.counts.drm_free, 2);
        assert_eq!(parsed.recent_notes.len(), 1);
    }
}
