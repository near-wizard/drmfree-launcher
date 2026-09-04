//! The `copyable_install` (D1) freedom test — decision 0025 flagged
//! this as "technically simpler [than network-blocking] but costs real
//! disk space and time per test" and deferred it for that reason. It's
//! still genuinely automatable with no elevation and no external data
//! source needed (unlike `no_publisher_auth_servers`, which would need
//! a curated publisher-domain list this project doesn't have), so it's
//! built here as a separate, explicitly-labeled, opt-in action — never
//! bundled into the fast "Run audit" button, since a multi-gigabyte
//! copy is a different order of cost than a network probe or a liveness
//! check. See decision 0031.

use crate::drm_axes::AxisResult;
use std::path::{Path, PathBuf};

/// A 10% safety margin on top of the measured install size — copying
/// exactly the free space available risks a mid-copy failure from
/// filesystem overhead (allocation blocks, journal writes) that a
/// byte-for-byte size comparison doesn't account for.
const FREE_SPACE_SAFETY_MARGIN: f64 = 1.1;

/// Every staging directory this module creates is named with this
/// prefix — used both when creating one and, in `sweep_stale_staging_dirs`,
/// to recognize leftovers from a run that never reached its own cleanup.
const STAGING_DIR_PREFIX: &str = "drmfree-launcher-portability-";

/// Cleans up any staging copy left behind by a previous run that never
/// reached its own `remove_dir_all` — found the hard way, not by
/// inspection: killing the app (or, in testing, the process running an
/// audit) mid-launch can leave the copied game's exe still running,
/// holding file locks `run_portability_audit`'s own cleanup then can't
/// clear, orphaning a multi-gigabyte directory in the user's temp
/// folder indefinitely. Called once at app startup (`lib.rs`), not
/// before every audit — a normal audit already cleans up after itself;
/// this only matters for the crash/force-kill case. Best-effort: a
/// directory still locked by a lingering process (the same reason it
/// was orphaned in the first place) is skipped, not retried — it'll be
/// swept on the next startup instead.
pub fn sweep_stale_staging_dirs() {
    sweep_stale_staging_dirs_in(&std::env::temp_dir());
}

/// The actual sweep, taking the directory to scan as a parameter —
/// split out so it's testable against an isolated directory rather
/// than the real system temp dir every other test's real staging
/// copies also live in. Sweeping the *real* temp dir from a test would
/// race any other test concurrently using a real staging directory
/// under the same prefix (cargo runs tests in parallel by default) —
/// found live: a first version of this test deleted a sibling test's
/// in-progress copy out from under it.
fn sweep_stale_staging_dirs_in(root: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let is_stale = entry.file_name().to_string_lossy().starts_with(STAGING_DIR_PREFIX)
            && entry.file_type().is_ok_and(|t| t.is_dir());
        if is_stale {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Recursively sums file sizes under `dir`. Best-effort: an unreadable
/// entry (a permissions quirk, a broken symlink) is skipped rather than
/// failing the whole measurement — an undercount here only makes the
/// free-space check slightly more conservative than reality, never less.
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += metadata.len();
        }
    }
    total
}

/// Recursively copies `src` into `dst` (which must not already exist),
/// preserving the directory structure. Returns the number of bytes
/// copied. Stops and returns an error on the first failure — a partial
/// copy isn't a meaningful basis for "does the copy launch," so this
/// doesn't try to soldier on past one.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<u64> {
    std::fs::create_dir_all(dst)?;
    let mut total = 0u64;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            total += copy_dir_recursive(&entry.path(), &dst_path)?;
        } else if file_type.is_file() {
            total += std::fs::copy(entry.path(), &dst_path)?;
        }
        // Symlinks are deliberately skipped rather than followed or
        // recreated — following one risks copying far more than the
        // install actually occupies (a link outside the install tree),
        // and recreating one loses meaning once relocated to a
        // different parent directory anyway.
    }
    Ok(total)
}

#[cfg(target_os = "windows")]
fn available_space(path: &Path) -> Option<u64> {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide = HSTRING::from(path.as_os_str());
    let mut free_to_caller: u64 = 0;
    // SAFETY: `wide` outlives the call; the two out-pointers are valid
    // local u64s the API is documented to write into on success. Only
    // free_to_caller is read — the other two documented out-params
    // (total bytes, total free bytes) aren't needed here.
    let ok = unsafe { GetDiskFreeSpaceExW(&wide, Some(&mut free_to_caller), None, None) };
    ok.ok().map(|_| free_to_caller)
}

#[cfg(not(target_os = "windows"))]
fn available_space(_path: &Path) -> Option<u64> {
    None
}

/// Spawns `exe_path` and waits up to `timeout_secs`, same liveness
/// logic as `axis_test.rs`'s launch audit — but unlike that one, a
/// process still running at the deadline gets killed here rather than
/// left alone: this exe is running from a disposable temp copy, not
/// the location the user actually plays from, so there's nothing of
/// theirs to interrupt and leaving it running would block cleanup.
async fn launch_and_check_alive_then_kill(exe_path: &Path, timeout_secs: u64) -> Result<AxisResult, String> {
    let mut child = tokio::process::Command::new(exe_path)
        .spawn()
        .map_err(|e| format!("failed to launch the copied exe: {e}"))?;

    let result = match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), child.wait()).await {
        Ok(Ok(status)) => Ok(if status.success() { AxisResult::Pass } else { AxisResult::Fail }),
        Ok(Err(e)) => Err(format!("failed to wait on the copied exe: {e}")),
        Err(_) => Ok(AxisResult::Pass), // still running at the deadline — didn't crash
    };

    // Best-effort: the process may have already exited on its own
    // (most common case, especially for a Fail), in which case kill()
    // is a harmless no-op error this doesn't need to surface.
    let _ = child.kill().await;
    result
}

/// Measures an install directory's size in bytes — exposed on its own
/// (not just folded into `run_portability_audit`'s internal call to
/// `dir_size`) so the frontend can show a real number and warn before
/// committing to a copy, for installs large enough that the copy step
/// itself takes real time (see `GameCard.tsx`'s size-threshold
/// confirmation). Runs the recursive directory walk on a blocking
/// thread — `dir_size` is synchronous I/O, and a large tree (many
/// thousands of files) walking it directly on an async task would
/// block that worker thread for the whole scan.
#[tauri::command]
pub async fn get_install_size(install_dir: String) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || dir_size(Path::new(&install_dir)))
        .await
        .map_err(|e| format!("failed to measure install size: {e}"))
}

/// The full copyable-install test: measures the install, checks there's
/// enough free space in the system temp directory (with a safety
/// margin), copies it there, launches the copy, and always attempts
/// cleanup afterward regardless of the outcome above — a failed
/// cleanup (e.g. a file the OS hasn't released yet) is logged to
/// stderr, not surfaced as this command's own failure, since the
/// portability *result* is already known by that point.
#[tauri::command]
pub async fn run_portability_audit(
    install_dir: String,
    exe_path: String,
    timeout_secs: u64,
) -> Result<AxisResult, String> {
    let install_dir = PathBuf::from(&install_dir);
    let exe_path = PathBuf::from(&exe_path);

    if !install_dir.is_dir() {
        return Err(format!("install directory does not exist: {}", install_dir.display()));
    }
    let relative_exe = exe_path
        .strip_prefix(&install_dir)
        .map_err(|_| "the executable is not inside the install directory".to_string())?;

    let size = dir_size(&install_dir);
    let staging_root = std::env::temp_dir();
    if let Some(free) = available_space(&staging_root) {
        let needed = (size as f64 * FREE_SPACE_SAFETY_MARGIN) as u64;
        if free < needed {
            return Err(format!(
                "not enough free space to test copying this install: needs about {needed} bytes, {free} available"
            ));
        }
    }
    // On a platform/error where free-space can't be determined, this
    // proceeds anyway rather than refusing outright — an unmeasurable
    // check shouldn't block a feature that's otherwise fully able to
    // run; std::fs::copy will fail loudly on its own if space actually
    // runs out mid-copy.

    let staging_dir = staging_root.join(format!("{STAGING_DIR_PREFIX}{}", uuid_like()));
    copy_dir_recursive(&install_dir, &staging_dir).map_err(|e| format!("failed to copy the install: {e}"))?;

    let copied_exe = staging_dir.join(relative_exe);
    let result = launch_and_check_alive_then_kill(&copied_exe, timeout_secs).await;

    if let Err(e) = std::fs::remove_dir_all(&staging_dir) {
        eprintln!("failed to clean up portability test copy at {}: {e}", staging_dir.display());
    }

    result
}

/// A short, good-enough-for-a-temp-dirname unique suffix — this project
/// has no `uuid` dependency to reach for, and a real UUID would be
/// overkill for "don't collide with a previous run's leftover folder
/// name," which a timestamp plus the process ID already solves.
fn uuid_like() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-portability-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn dir_size_sums_files_recursively_across_subdirectories() {
        let dir = temp_dir("size");
        std::fs::write(dir.join("a.txt"), "12345").unwrap();
        std::fs::create_dir(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub").join("b.txt"), "1234567890").unwrap();

        assert_eq!(dir_size(&dir), 15);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn sweep_stale_staging_dirs_removes_only_directories_with_the_staging_prefix() {
        // An isolated fake "temp root" — not std::env::temp_dir()
        // itself, which real staging copies from other concurrently-
        // running tests also live in (cargo runs tests in parallel by
        // default); sweeping the real one here would risk deleting a
        // sibling test's in-progress copy out from under it.
        let root = temp_dir("sweep-root");

        let stale = root.join(format!("{STAGING_DIR_PREFIX}leftover"));
        std::fs::create_dir_all(&stale).unwrap();
        std::fs::write(stale.join("leftover.bin"), "data").unwrap();

        let unrelated = root.join("unrelated-dir");
        std::fs::create_dir_all(&unrelated).unwrap();
        std::fs::write(unrelated.join("keep-me.txt"), "data").unwrap();

        sweep_stale_staging_dirs_in(&root);

        assert!(!stale.exists(), "stale staging directory should have been swept");
        assert!(unrelated.exists(), "an unrelated directory must not be touched");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn get_install_size_matches_dir_size_for_a_real_directory() {
        let dir = temp_dir("get-install-size");
        std::fs::write(dir.join("a.txt"), "12345").unwrap();

        let reported = get_install_size(dir.to_string_lossy().to_string()).await.unwrap();
        assert_eq!(reported, 5);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dir_size_is_zero_for_an_empty_or_missing_directory() {
        let dir = temp_dir("empty");
        assert_eq!(dir_size(&dir), 0);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(dir_size(&dir), 0); // now missing entirely
    }

    #[test]
    fn copy_dir_recursive_reproduces_the_full_tree_and_reports_bytes_copied() {
        let src = temp_dir("copy-src");
        let dst = temp_dir("copy-dst");
        std::fs::remove_dir_all(&dst).unwrap(); // copy_dir_recursive creates it fresh

        std::fs::write(src.join("game.exe"), "fake-exe-bytes").unwrap();
        std::fs::create_dir(src.join("data")).unwrap();
        std::fs::write(src.join("data").join("assets.pak"), "fake-pak-bytes-longer").unwrap();

        let copied = copy_dir_recursive(&src, &dst).unwrap();
        assert_eq!(copied, dir_size(&src));
        assert!(dst.join("game.exe").is_file());
        assert!(dst.join("data").join("assets.pak").is_file());
        assert_eq!(
            std::fs::read_to_string(dst.join("game.exe")).unwrap(),
            "fake-exe-bytes"
        );

        std::fs::remove_dir_all(&src).unwrap();
        std::fs::remove_dir_all(&dst).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn available_space_returns_a_plausible_positive_value_for_the_temp_dir() {
        let free = available_space(&std::env::temp_dir());
        assert!(free.is_some());
        assert!(free.unwrap() > 0);
    }

    #[tokio::test]
    async fn run_portability_audit_rejects_an_exe_path_outside_the_install_dir() {
        let install_dir = temp_dir("portability-mismatch");
        let result = run_portability_audit(
            install_dir.to_string_lossy().to_string(),
            "C:\\Somewhere\\Else\\game.exe".to_string(),
            5,
        )
        .await;
        assert!(result.is_err());
        std::fs::remove_dir_all(&install_dir).unwrap();
    }

    #[tokio::test]
    async fn run_portability_audit_rejects_a_missing_install_dir() {
        let missing = std::env::temp_dir().join("drmfree-launcher-test-does-not-exist-xyz");
        let result = run_portability_audit(
            missing.to_string_lossy().to_string(),
            missing.join("game.exe").to_string_lossy().to_string(),
            5,
        )
        .await;
        assert!(result.is_err());
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn run_portability_audit_copies_launches_and_cleans_up_a_real_small_install() {
        // A real, minimal PE binary standing in for a game exe —
        // std::process::Command (unlike a shell) can't launch a .bat/
        // .cmd script directly, it needs an actual executable, so this
        // copies a real one (notepad.exe, present on every Windows
        // install, same one icon.rs's own tests already rely on being
        // there) rather than needing a real installed game on the
        // CI/dev machine. notepad stays open waiting for input, which
        // exercises the "still running at the deadline, then killed
        // for cleanup" path rather than the "exited on its own" one.
        let install_dir = temp_dir("portability-e2e");
        let exe_path = install_dir.join("game.exe");
        std::fs::copy("C:\\Windows\\System32\\notepad.exe", &exe_path).unwrap();
        std::fs::create_dir(install_dir.join("data")).unwrap();
        std::fs::write(install_dir.join("data").join("save.dat"), "fake save data").unwrap();

        let result = run_portability_audit(
            install_dir.to_string_lossy().to_string(),
            exe_path.to_string_lossy().to_string(),
            1,
        )
        .await
        .unwrap();
        assert_eq!(result, AxisResult::Pass);

        // The staging copy must be cleaned up — no leftover
        // drmfree-launcher-portability-* directories in the temp root.
        let leftovers: Vec<_> = std::fs::read_dir(std::env::temp_dir())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(STAGING_DIR_PREFIX))
            .collect();
        assert!(leftovers.is_empty(), "expected no leftover staging directories, found {leftovers:?}");

        std::fs::remove_dir_all(&install_dir).unwrap();
    }
}
