//! Local, opt-in automation for a subset of the eleven freedom tests
//! (`drm_axes.rs`, decision 0024). Not all eleven have an automation
//! path — see decision 0025 for the full per-axis feasibility
//! breakdown. What's here:
//!
//! - `structural_axes`: `no_storefront_client`/`no_launcher` aren't
//!   really *tests* — which provider detected a game already proves
//!   them, since GOG/Humble's own `launch()` runs the exe directly and
//!   Steam/Epic's always mediates through a protocol handler. Pure
//!   lookup, no process launch, safe to call unconditionally.
//! - `run_launch_smoke_test`: a real (if weak) heuristic for
//!   `first_launch_offline` — spawns the exe and watches whether it
//!   stays alive past a short window instead of crashing/exiting.
//!   Deliberately does **not** block network access (that needs
//!   elevated firewall rules with guaranteed cleanup — a bigger,
//!   separate piece, not built here) — it only tells you "does this
//!   launch and not immediately die," not "does this work offline."
//!
//! Results from these are surfaced as a **local-only** badge
//! (`src/lib/localAxisTests.ts`) — never auto-submitted to the shared
//! `drmfree-community` consensus pool. Sharing one is still a
//! conscious, separate action through the existing manual report flow.

use crate::drm_axes::{AxisResult, DrmAxes};

/// `no_storefront_client`/`no_launcher` are known facts about a
/// provider, not something to test per-game — every GOG/Humble game
/// is launcher-free by construction (see those providers' own
/// `launch()`), every Steam/Epic game always mediates through a
/// protocol handler. `Unknown` for anything else (e.g. manually-added
/// entries, which have no provider-level guarantee either way).
#[tauri::command]
pub fn structural_axes(provider: String) -> DrmAxes {
    let mut axes = DrmAxes::unknown();
    let result = match provider.as_str() {
        "gog" | "humble" => AxisResult::Pass,
        "steam" | "epic" => AxisResult::Fail,
        _ => AxisResult::Unknown,
    };
    axes.no_storefront_client = result;
    axes.no_launcher = result;
    axes
}

/// Spawns `program` (with `args`) and waits up to `timeout_secs` for
/// it to exit. `Pass` if it's still running (or exited successfully)
/// at the deadline — a game that's still running hasn't crashed,
/// which is the only signal this crude a check can actually offer.
/// `Fail` only for an exit that happens *before* the deadline with a
/// nonzero status — a real, if blunt, crash/license-check-failure
/// signal. Deliberately never kills a still-running process at the
/// deadline: by then it's just the user's game, actually launched and
/// playing, not something this check should interrupt.
async fn spawn_and_wait(program: &str, args: &[&str], timeout_secs: u64) -> Result<AxisResult, String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to launch {program}: {e}"))?;

    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), child.wait()).await {
        Ok(Ok(status)) => Ok(if status.success() { AxisResult::Pass } else { AxisResult::Fail }),
        Ok(Err(e)) => Err(format!("failed to wait on process: {e}")),
        Err(_) => Ok(AxisResult::Pass),
    }
}

/// The `first_launch_offline` smoke test — see the module doc comment
/// for exactly what this does and doesn't prove. Only meaningful for
/// providers with a real local exe path (GOG/Humble); the frontend is
/// responsible for not offering this for Steam/Epic's protocol-launch
/// ids (see `Game.exe_path`'s doc comment in `providers/mod.rs`).
#[tauri::command]
pub async fn run_launch_smoke_test(exe_path: String, timeout_secs: u64) -> Result<AxisResult, String> {
    spawn_and_wait(&exe_path, &[], timeout_secs).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structural_axes_passes_no_launcher_axes_for_gog_and_humble() {
        for provider in ["gog", "humble"] {
            let axes = structural_axes(provider.to_string());
            assert_eq!(axes.no_storefront_client, AxisResult::Pass);
            assert_eq!(axes.no_launcher, AxisResult::Pass);
        }
    }

    #[test]
    fn structural_axes_fails_no_launcher_axes_for_steam_and_epic() {
        for provider in ["steam", "epic"] {
            let axes = structural_axes(provider.to_string());
            assert_eq!(axes.no_storefront_client, AxisResult::Fail);
            assert_eq!(axes.no_launcher, AxisResult::Fail);
        }
    }

    #[test]
    fn structural_axes_leaves_unrecognized_providers_unknown() {
        let axes = structural_axes("manual".to_string());
        assert_eq!(axes.no_storefront_client, AxisResult::Unknown);
        assert_eq!(axes.no_launcher, AxisResult::Unknown);
    }

    #[test]
    fn structural_axes_only_touches_the_two_client_launcher_fields() {
        // Every other axis must stay Unknown — this function isn't the
        // source of truth for anything but the two it's named after.
        let axes = structural_axes("gog".to_string());
        assert_eq!(axes.first_launch_offline, AxisResult::Unknown);
        assert_eq!(axes.continued_offline_play, AxisResult::Unknown);
        assert_eq!(axes.no_publisher_account, AxisResult::Unknown);
        assert_eq!(axes.no_storefront_account, AxisResult::Unknown);
        assert_eq!(axes.copyable_install, AxisResult::Unknown);
        assert_eq!(axes.reinstallable_from_offline_media, AxisResult::Unknown);
        assert_eq!(axes.no_publisher_auth_servers, AxisResult::Unknown);
        assert_eq!(axes.no_third_party_services, AxisResult::Unknown);
        assert_eq!(axes.no_server_dependent_core_features, AxisResult::Unknown);
    }

    // Platform-appropriate "exit immediately with this code" command —
    // real games are launched with no args (see run_launch_smoke_test),
    // but a controllable exit code is the only way to deterministically
    // test both branches without depending on a real installed game.
    fn quick_exit(code: i32) -> (&'static str, Vec<String>) {
        #[cfg(target_os = "windows")]
        {
            ("cmd", vec!["/C".to_string(), format!("exit {code}")])
        }
        #[cfg(not(target_os = "windows"))]
        {
            ("sh", vec!["-c".to_string(), format!("exit {code}")])
        }
    }

    // Platform-appropriate "sleep for a couple seconds" command — used
    // to exercise the "still running at the deadline" branch.
    fn sleep_a_bit() -> (&'static str, Vec<String>) {
        #[cfg(target_os = "windows")]
        {
            ("cmd", vec!["/C".to_string(), "ping -n 3 127.0.0.1 >NUL".to_string()])
        }
        #[cfg(not(target_os = "windows"))]
        {
            ("sh", vec!["-c".to_string(), "sleep 2".to_string()])
        }
    }

    #[tokio::test]
    async fn spawn_and_wait_passes_when_the_process_exits_successfully() {
        let (program, args) = quick_exit(0);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let result = spawn_and_wait(program, &args, 5).await.unwrap();
        assert_eq!(result, AxisResult::Pass);
    }

    #[tokio::test]
    async fn spawn_and_wait_fails_when_the_process_exits_nonzero_before_the_deadline() {
        let (program, args) = quick_exit(1);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let result = spawn_and_wait(program, &args, 5).await.unwrap();
        assert_eq!(result, AxisResult::Fail);
    }

    #[tokio::test]
    async fn spawn_and_wait_passes_when_still_running_at_the_deadline() {
        let (program, args) = sleep_a_bit();
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        // A near-zero timeout against a multi-second sleep reliably
        // hits the "still running" branch without slowing the suite.
        let result = spawn_and_wait(program, &args, 0).await.unwrap();
        assert_eq!(result, AxisResult::Pass);
    }

    #[tokio::test]
    async fn spawn_and_wait_errors_when_the_program_does_not_exist() {
        let result = spawn_and_wait("definitely-not-a-real-program-xyz", &[], 5).await;
        assert!(result.is_err());
    }
}
