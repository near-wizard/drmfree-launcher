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
//! - `run_launch_audit`: a real (if weak) heuristic for two axes at
//!   once, from a single launch — `first_launch_offline` (does it stay
//!   alive past a short window instead of crashing/exiting) and
//!   `no_third_party_services` (does it open any real outbound network
//!   connection while starting up, observed via a read-only query of
//!   the system's TCP connection table — no elevation required, unlike
//!   blocking network access outright, which decision 0025 deferred
//!   for exactly that reason). Neither is proof: a game stuck on an
//!   error dialog looks identical to a playable one to the liveness
//!   check, and a connection attempt only during the first N seconds
//!   isn't the same as "requires" one for core gameplay.
//!
//! Results from these are surfaced as a **local-only** badge by
//! default (`src/lib/localAxisTests.ts`); the launcher UI offers an
//! explicit, opt-in "auto-submit" checkbox for users who want an audit
//! run to post straight to the shared `drmfree-community` pool without
//! a separate click — see decision 0026. Off by default.

use crate::drm_axes::{AxisResult, DrmAxes};
use serde::Serialize;

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

/// A read-only query of the OS's own TCP connection table, filtered by
/// PID — deliberately not a firewall rule: querying who's connected to
/// what needs no elevation, unlike *blocking* a process's network
/// access, which is why this is buildable now and the network-blocked
/// smoke test decision 0025 described isn't.
#[cfg(target_os = "windows")]
mod network {
    use windows::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, TCP_TABLE_OWNER_PID_ALL};
    use windows::Win32::Networking::WinSock::AF_INET;

    pub fn supported() -> bool {
        true
    }

    /// `None` on any failure along the way (including "this platform
    /// doesn't support the query") — a probe hiccup degrades this one
    /// secondary signal to Unknown, never fails the whole audit over
    /// it. `Some(true)` means `pid` owns at least one TCP row that
    /// looks like a real connection rather than a passive listener: a
    /// listening socket's remote address is always all-zero, so a
    /// nonzero remote address is what's checked for.
    pub fn has_outbound_connection(pid: u32) -> Option<bool> {
        let mut size: u32 = 0;
        // SAFETY: a null buffer + size 0 is the documented way to ask
        // GetExtendedTcpTable how large a buffer it actually needs;
        // the call is expected to "fail" here, only `size` matters.
        unsafe {
            let _ = GetExtendedTcpTable(None, &mut size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        }
        if size == 0 {
            return None;
        }

        // Allocated as u32 words, not bytes: every field in the table
        // (the entry count, then six-u32 rows) is itself a u32, so a
        // word-aligned buffer means the parsing below never needs an
        // unaligned pointer cast — plain safe slice indexing instead.
        let word_count = size.div_ceil(4) as usize;
        let mut buffer: Vec<u32> = vec![0; word_count];
        // SAFETY: buffer is sized exactly per the size query above.
        let result = unsafe {
            GetExtendedTcpTable(
                Some(buffer.as_mut_ptr() as *mut _),
                &mut size,
                false,
                AF_INET.0 as u32,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if result != 0 {
            return None;
        }

        let num_entries = *buffer.first()? as usize;
        const ROW_WORDS: usize = 6; // state, local_addr, local_port, remote_addr, remote_port, owning_pid
        let needed = 1 + num_entries * ROW_WORDS;
        if buffer.len() < needed {
            return None;
        }

        for i in 0..num_entries {
            let row = &buffer[1 + i * ROW_WORDS..1 + i * ROW_WORDS + ROW_WORDS];
            let remote_addr = row[3];
            let owning_pid = row[5];
            if owning_pid == pid && remote_addr != 0 {
                return Some(true);
            }
        }
        Some(false)
    }
}

#[cfg(not(target_os = "windows"))]
mod network {
    pub fn supported() -> bool {
        false
    }
    pub fn has_outbound_connection(_pid: u32) -> Option<bool> {
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct LaunchAuditResult {
    pub first_launch_offline: AxisResult,
    pub no_third_party_services: AxisResult,
}

/// Spawns `program` (with `args`), waits up to `timeout_secs` for it to
/// exit, and — from that same single launch — polls whether it opens
/// any real outbound network connection. `first_launch_offline`: `Pass`
/// if still running (or exited successfully) at the deadline, `Fail`
/// only for a nonzero exit *before* the deadline (a real, if blunt,
/// crash/license-check-failure signal). Never kills a still-running
/// process at the deadline — by then it's just the user's game,
/// actually launched and playing. `no_third_party_services`: `Fail` if
/// any connection was observed, `Pass` if genuinely none were despite
/// the platform supporting the probe, `Unknown` if the probe isn't
/// supported here at all (see `network::supported`).
async fn spawn_and_audit(program: &str, args: &[&str], timeout_secs: u64) -> Result<LaunchAuditResult, String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to launch {program}: {e}"))?;
    let pid = child.id();

    let mut saw_connection = false;
    let poll_interval = std::time::Duration::from_millis(300);
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

    let liveness = loop {
        if let Some(pid) = pid {
            if network::has_outbound_connection(pid) == Some(true) {
                saw_connection = true;
            }
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break AxisResult::Pass;
        }
        match tokio::time::timeout(remaining.min(poll_interval), child.wait()).await {
            Ok(Ok(status)) => break if status.success() { AxisResult::Pass } else { AxisResult::Fail },
            Ok(Err(e)) => return Err(format!("failed to wait on process: {e}")),
            Err(_) => continue, // poll interval elapsed, process still running — poll again
        }
    };

    let no_third_party_services = if !network::supported() {
        AxisResult::Unknown
    } else if saw_connection {
        AxisResult::Fail
    } else {
        AxisResult::Pass
    };

    Ok(LaunchAuditResult { first_launch_offline: liveness, no_third_party_services })
}

/// The consolidated launch audit — see the module doc comment for
/// exactly what this does and doesn't prove. Only meaningful for
/// providers with a real local exe path (GOG/Humble); the frontend is
/// responsible for not offering this for Steam/Epic's protocol-launch
/// ids (see `Game.exe_path`'s doc comment in `providers/mod.rs`).
#[tauri::command]
pub async fn run_launch_audit(exe_path: String, timeout_secs: u64) -> Result<LaunchAuditResult, String> {
    spawn_and_audit(&exe_path, &[], timeout_secs).await
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
    async fn spawn_and_audit_passes_liveness_when_the_process_exits_successfully() {
        let (program, args) = quick_exit(0);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let result = spawn_and_audit(program, &args, 5).await.unwrap();
        assert_eq!(result.first_launch_offline, AxisResult::Pass);
    }

    #[tokio::test]
    async fn spawn_and_audit_fails_liveness_when_the_process_exits_nonzero_before_the_deadline() {
        let (program, args) = quick_exit(1);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let result = spawn_and_audit(program, &args, 5).await.unwrap();
        assert_eq!(result.first_launch_offline, AxisResult::Fail);
    }

    #[tokio::test]
    async fn spawn_and_audit_passes_liveness_when_still_running_at_the_deadline() {
        let (program, args) = sleep_a_bit();
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        // A near-zero timeout against a multi-second sleep reliably
        // hits the "still running" branch without slowing the suite.
        let result = spawn_and_audit(program, &args, 0).await.unwrap();
        assert_eq!(result.first_launch_offline, AxisResult::Pass);
    }

    #[tokio::test]
    async fn spawn_and_audit_errors_when_the_program_does_not_exist() {
        let result = spawn_and_audit("definitely-not-a-real-program-xyz", &[], 5).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn spawn_and_audit_passes_no_third_party_services_for_a_process_that_opens_no_connections() {
        let (program, args) = quick_exit(0);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let result = spawn_and_audit(program, &args, 5).await.unwrap();
        // On an unsupported platform (non-Windows) this degrades to
        // Unknown rather than a false Pass — either is correct here,
        // what would be wrong is Fail for a process that never opened
        // a socket at all.
        assert_ne!(result.no_third_party_services, AxisResult::Fail);
    }

    // network::has_outbound_connection is exercised directly (not just
    // through spawn_and_audit) against this *test process's own* PID —
    // deliberately loopback-only (bind a listener, connect to it from
    // the same process) so this is CI-safe even on a network-sandboxed
    // runner with no real internet access.
    //
    // Both the positive and negative cases are one test, not two,
    // deliberately: cargo runs `#[test]` functions in parallel by
    // default, and the process's own TCP table is genuinely global
    // state, not per-test — a separate "before any socket" test raced
    // against this one intermittently, since `has_outbound_connection`
    // can't tell which thread's test opened a given connection, only
    // that *this PID* owns one. Found live via a real flake, not by
    // inspection. Sequencing both assertions in one function is a
    // correctness fix, not just a style preference: it's the only way
    // to guarantee "before" really means before.
    #[cfg(target_os = "windows")]
    #[test]
    fn has_outbound_connection_reflects_this_process_before_and_after_opening_a_real_socket() {
        use std::net::{TcpListener, TcpStream};

        let pid = std::process::id();
        assert_eq!(network::has_outbound_connection(pid), Some(false));

        let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind a local listener for the test");
        let addr = listener.local_addr().unwrap();
        let _client = TcpStream::connect(addr).expect("failed to connect to the local test listener");
        let _server_side = listener.accept().expect("failed to accept the local test connection");

        assert_eq!(network::has_outbound_connection(pid), Some(true));
    }
}
