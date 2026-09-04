//! Mod Manager, Phase A (decision 0028 option A, packaged per decision
//! 0029/0030, this module's own shape decided in decision 0032).
//!
//! Zero new trust surface: every command here only reads or renames
//! files already sitting in a directory the user explicitly pointed
//! the app at. Nothing is fetched, nothing is extracted, nothing is
//! executed. That's the whole boundary 0028 drew for "A" and this
//! module doesn't cross it.
//!
//! Engine-agnostic by necessity, not just simplicity: this project has
//! no database of "which subfolder does game X's modding convention
//! use" (0028 explicitly calls that out as its own, ongoing research
//! project, not a one-time architectural call). So Phase A asks the
//! user to point at a mods folder rather than guessing one — see
//! `suggest_mod_dirs` for the one small concession to convenience this
//! makes (a handful of common subfolder names, offered, never assumed).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// The enable/disable mechanism: append/strip this suffix on the
/// on-disk file or folder name. This is a real, widely-tolerated
/// convention among folder-based mod loaders (many simply skip any
/// entry whose name doesn't match what they expect, so a renamed
/// entry is invisible to them without deleting anything) — but it's
/// not universal, and this module makes no claim it works for every
/// engine/loader. Documented in decision 0032.
const DISABLED_SUFFIX: &str = ".disabled";

/// Sidecar file this module writes *inside* the mods directory itself
/// to remember display order. Dot-prefixed so `list_mods` (which skips
/// dotfiles, same as it should skip `.DS_Store`/`.git`/etc.) never
/// lists it as a mod. Living next to the mods it describes — rather
/// than in a central app-data location keyed by path — means it
/// travels naturally if the user moves the whole mods folder, and
/// there's nothing for this app to keep in sync if the folder is
/// renamed or the game reinstalled elsewhere.
const ORDER_FILE: &str = ".drmfree-mod-order.json";

/// Small, optional seed list of conventional mod-subfolder names,
/// offered as suggestions only — never auto-applied. This is
/// deliberately not a per-game database (0028 calls maintaining one a
/// standing research project, out of scope for Phase A); it's just a
/// handful of names common enough across many engines that checking
/// for them costs nothing and saves a click when they happen to exist.
const CONVENTIONAL_SUBDIRS: &[&str] = &["Mods", "mods", "Data"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ModEntry {
    /// Display name with any `.disabled` suffix stripped.
    pub name: String,
    /// The actual on-disk entry name — what `toggle_mod` must be
    /// called with, since it's what the filesystem actually has.
    pub raw_name: String,
    pub enabled: bool,
    pub is_dir: bool,
}

fn is_hidden(raw_name: &str) -> bool {
    raw_name.starts_with('.')
}

fn strip_disabled(raw_name: &str) -> &str {
    raw_name.strip_suffix(DISABLED_SUFFIX).unwrap_or(raw_name)
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct OrderManifest {
    /// Base (suffix-stripped) names, in the order the user last set.
    /// Anything not listed here sorts after everything that is,
    /// alphabetically — see `apply_order`.
    order: Vec<String>,
}

fn order_file_path(dir: &Path) -> PathBuf {
    dir.join(ORDER_FILE)
}

fn read_order(dir: &Path) -> Vec<String> {
    let path = order_file_path(dir);
    let Ok(contents) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str::<OrderManifest>(&contents)
        .map(|m| m.order)
        .unwrap_or_default()
}

fn apply_order(mut entries: Vec<ModEntry>, order: &[String]) -> Vec<ModEntry> {
    entries.sort_by(|a, b| {
        let a_pos = order.iter().position(|n| n == &a.name);
        let b_pos = order.iter().position(|n| n == &b.name);
        match (a_pos, b_pos) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    entries
}

fn validate_dir(dir: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(dir);
    if !path.is_dir() {
        return Err(format!("{dir} is not a directory"));
    }
    Ok(path)
}

/// Rejects anything that isn't a bare filename — no path separators,
/// no `..`, not empty. `raw_name` always comes from a prior
/// `list_mods` call in the intended flow, but this command trusts
/// nothing the frontend sends: a compromised or buggy caller handing
/// back a crafted name must not be able to walk `toggle_mod` outside
/// the directory it was given.
fn validate_entry_name(raw_name: &str) -> Result<(), String> {
    if raw_name.is_empty()
        || raw_name == "."
        || raw_name == ".."
        || raw_name.contains('/')
        || raw_name.contains('\\')
    {
        return Err(format!("invalid mod entry name: {raw_name:?}"));
    }
    Ok(())
}

/// Lists the top-level entries of a user-chosen mods directory as
/// "mods" — files and folders alike, since a flat-file mod (a single
/// `.esp`/`.pak`/DLL) and a folder-based one (a whole `Data/`-style
/// overlay tree) are both real, common shapes and Phase A has no
/// per-engine knowledge to tell them apart. Ordered by any
/// previously-saved order (`set_mod_order`), then alphabetically for
/// anything not yet ordered.
#[tauri::command]
pub fn list_mods(dir: String) -> Result<Vec<ModEntry>, String> {
    let path = validate_dir(&dir)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| format!("failed to read {dir}: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let raw_name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&raw_name) {
            continue;
        }
        let enabled = !raw_name.ends_with(DISABLED_SUFFIX);
        let name = strip_disabled(&raw_name).to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(ModEntry { name, raw_name, enabled, is_dir });
    }
    entries.sort_by_key(|e| e.name.to_lowercase());
    let order = read_order(&path);
    Ok(apply_order(entries, &order))
}

/// Enables or disables a mod by renaming it (appending/stripping
/// `.disabled`). Returns the entry's new on-disk name so the caller
/// can update its own state without a full re-list. No-ops (returns
/// the unchanged name) if the entry is already in the requested state.
#[tauri::command]
pub fn toggle_mod(dir: String, raw_name: String, enabled: bool) -> Result<String, String> {
    let path = validate_dir(&dir)?;
    validate_entry_name(&raw_name)?;

    let src = path.join(&raw_name);
    if !src.exists() {
        return Err(format!("{raw_name} not found in {dir}"));
    }

    let currently_enabled = !raw_name.ends_with(DISABLED_SUFFIX);
    if currently_enabled == enabled {
        return Ok(raw_name);
    }

    let base = strip_disabled(&raw_name);
    let new_raw_name = if enabled {
        base.to_string()
    } else {
        format!("{base}{DISABLED_SUFFIX}")
    };
    let dst = path.join(&new_raw_name);
    if dst.exists() {
        return Err(format!(
            "can't rename {raw_name} to {new_raw_name}: an entry with that name already exists"
        ));
    }

    fs::rename(&src, &dst).map_err(|e| format!("failed to rename {raw_name}: {e}"))?;
    Ok(new_raw_name)
}

/// Persists a display order for the given mods directory. This is
/// pure bookkeeping — for a generic, engine-agnostic tool like Phase A,
/// nothing downstream reads this order to decide what actually loads
/// first in-game. It only controls the order `list_mods` returns
/// entries in, so the UI can show a stable, user-arranged list. Any
/// engine-specific load-order enforcement (a real `loadorder.txt`,
/// plugin priority, etc.) is out of scope until a specific engine gets
/// integrated in a later phase.
#[tauri::command]
pub fn set_mod_order(dir: String, order: Vec<String>) -> Result<(), String> {
    let path = validate_dir(&dir)?;
    for name in &order {
        validate_entry_name(name)?;
    }
    let manifest = OrderManifest { order };
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(order_file_path(&path), json).map_err(|e| format!("failed to save mod order: {e}"))
}

/// Checks a handful of conventional subfolder names (see
/// `CONVENTIONAL_SUBDIRS`) under an install directory and returns
/// which ones actually exist — a convenience suggestion only, never
/// auto-selected. Empty result (no convention matched, or no
/// `install_dir` known) is expected and fine: the user just types or
/// pastes their own path in that case.
#[tauri::command]
pub fn suggest_mod_dirs(install_dir: String) -> Vec<String> {
    let base = Path::new(&install_dir);
    if !base.is_dir() {
        return Vec::new();
    }
    CONVENTIONAL_SUBDIRS
        .iter()
        .map(|name| base.join(name))
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-mods-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn list_mods_rejects_a_nonexistent_directory() {
        let result = list_mods("Z:\\this\\does\\not\\exist\\at\\all".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn list_mods_lists_files_and_folders_skips_dotfiles() {
        let dir = temp_dir("list-basic");
        fs::write(dir.join("CoolMod.esp"), "").unwrap();
        fs::create_dir(dir.join("BiggerMod")).unwrap();
        fs::write(dir.join(".drmfree-mod-order.json"), "{}").unwrap();

        let entries = list_mods(dir.to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"CoolMod.esp"));
        assert!(names.contains(&"BiggerMod"));

        let dir_entry = entries.iter().find(|e| e.name == "BiggerMod").unwrap();
        assert!(dir_entry.is_dir);
        let file_entry = entries.iter().find(|e| e.name == "CoolMod.esp").unwrap();
        assert!(!file_entry.is_dir);
    }

    #[test]
    fn list_mods_reports_disabled_suffix_entries_as_disabled_with_stripped_display_name() {
        let dir = temp_dir("list-disabled");
        fs::write(dir.join("QuietMod.esp.disabled"), "").unwrap();

        let entries = list_mods(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "QuietMod.esp");
        assert_eq!(entries[0].raw_name, "QuietMod.esp.disabled");
        assert!(!entries[0].enabled);
    }

    #[test]
    fn toggle_mod_disables_by_appending_suffix() {
        let dir = temp_dir("toggle-disable");
        fs::write(dir.join("Mod.esp"), "").unwrap();

        let new_name = toggle_mod(dir.to_string_lossy().into_owned(), "Mod.esp".to_string(), false).unwrap();
        assert_eq!(new_name, "Mod.esp.disabled");
        assert!(!dir.join("Mod.esp").exists());
        assert!(dir.join("Mod.esp.disabled").exists());
    }

    #[test]
    fn toggle_mod_enables_by_stripping_suffix() {
        let dir = temp_dir("toggle-enable");
        fs::write(dir.join("Mod.esp.disabled"), "").unwrap();

        let new_name = toggle_mod(dir.to_string_lossy().into_owned(), "Mod.esp.disabled".to_string(), true).unwrap();
        assert_eq!(new_name, "Mod.esp");
        assert!(dir.join("Mod.esp").exists());
        assert!(!dir.join("Mod.esp.disabled").exists());
    }

    #[test]
    fn toggle_mod_is_a_noop_when_already_in_the_requested_state() {
        let dir = temp_dir("toggle-noop");
        fs::write(dir.join("Mod.esp"), "").unwrap();

        let new_name = toggle_mod(dir.to_string_lossy().into_owned(), "Mod.esp".to_string(), true).unwrap();
        assert_eq!(new_name, "Mod.esp");
        assert!(dir.join("Mod.esp").exists());
    }

    #[test]
    fn toggle_mod_rejects_a_name_with_path_separators() {
        let dir = temp_dir("toggle-traversal");
        let result = toggle_mod(
            dir.to_string_lossy().into_owned(),
            "../../evil".to_string(),
            false,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid mod entry name"));
    }

    #[test]
    fn toggle_mod_rejects_a_backslash_name_on_any_platform() {
        // Defense in depth even though Windows paths naturally use
        // backslashes: this argument always names a single entry
        // within a directory `list_mods` already resolved, so a
        // backslash here can only be an attempt to address a sibling
        // or nested path, never a legitimate single entry name.
        let dir = temp_dir("toggle-backslash");
        let result = toggle_mod(dir.to_string_lossy().into_owned(), "sub\\evil".to_string(), false);
        assert!(result.is_err());
    }

    #[test]
    fn toggle_mod_rejects_an_entry_that_does_not_exist() {
        let dir = temp_dir("toggle-missing");
        let result = toggle_mod(dir.to_string_lossy().into_owned(), "Ghost.esp".to_string(), false);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn toggle_mod_refuses_to_clobber_an_existing_destination() {
        let dir = temp_dir("toggle-clobber");
        fs::write(dir.join("Mod.esp"), "a").unwrap();
        fs::write(dir.join("Mod.esp.disabled"), "b").unwrap();

        let result = toggle_mod(dir.to_string_lossy().into_owned(), "Mod.esp".to_string(), false);
        assert!(result.is_err());
        // Neither file should have moved.
        assert!(dir.join("Mod.esp").exists());
        assert!(dir.join("Mod.esp.disabled").exists());
    }

    #[test]
    fn set_mod_order_then_list_mods_reflects_the_saved_order() {
        let dir = temp_dir("order-roundtrip");
        fs::write(dir.join("Alpha.esp"), "").unwrap();
        fs::write(dir.join("Beta.esp"), "").unwrap();
        fs::write(dir.join("Gamma.esp"), "").unwrap();

        set_mod_order(
            dir.to_string_lossy().into_owned(),
            vec!["Gamma.esp".to_string(), "Alpha.esp".to_string(), "Beta.esp".to_string()],
        )
        .unwrap();

        let entries = list_mods(dir.to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Gamma.esp", "Alpha.esp", "Beta.esp"]);
    }

    #[test]
    fn set_mod_order_persists_across_disable_since_order_is_keyed_by_base_name() {
        let dir = temp_dir("order-survives-toggle");
        fs::write(dir.join("Alpha.esp"), "").unwrap();
        fs::write(dir.join("Beta.esp"), "").unwrap();

        set_mod_order(
            dir.to_string_lossy().into_owned(),
            vec!["Beta.esp".to_string(), "Alpha.esp".to_string()],
        )
        .unwrap();
        toggle_mod(dir.to_string_lossy().into_owned(), "Beta.esp".to_string(), false).unwrap();

        let entries = list_mods(dir.to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Beta.esp", "Alpha.esp"]);
        assert!(!entries[0].enabled);
    }

    #[test]
    fn list_mods_puts_unordered_new_entries_after_ordered_ones_alphabetically() {
        let dir = temp_dir("order-partial");
        fs::write(dir.join("Alpha.esp"), "").unwrap();
        fs::write(dir.join("Beta.esp"), "").unwrap();
        fs::write(dir.join("NewOne.esp"), "").unwrap();

        set_mod_order(
            dir.to_string_lossy().into_owned(),
            vec!["Beta.esp".to_string(), "Alpha.esp".to_string()],
        )
        .unwrap();

        let entries = list_mods(dir.to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Beta.esp", "Alpha.esp", "NewOne.esp"]);
    }

    #[test]
    fn set_mod_order_rejects_a_name_with_path_separators() {
        let dir = temp_dir("order-traversal");
        let result = set_mod_order(dir.to_string_lossy().into_owned(), vec!["../evil".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn suggest_mod_dirs_returns_only_existing_conventional_subdirs() {
        let dir = temp_dir("suggest");
        fs::create_dir(dir.join("Data")).unwrap();
        // "Mods" / "mods" deliberately absent.

        let suggestions = suggest_mod_dirs(dir.to_string_lossy().into_owned());
        assert_eq!(suggestions.len(), 1);
        assert!(suggestions[0].ends_with("Data"));
    }

    #[test]
    fn suggest_mod_dirs_returns_empty_for_a_nonexistent_install_dir() {
        let suggestions = suggest_mod_dirs("Z:\\nope\\not\\real".to_string());
        assert!(suggestions.is_empty());
    }

    #[test]
    fn list_mods_and_toggle_mod_never_touch_anything_outside_the_given_directory() {
        // Regression guard for the ACL gap documented in decision 0032:
        // since Tauri's capability system doesn't scope these app
        // commands per-window today, the commands' own input
        // validation is the only thing standing between a caller and
        // an out-of-directory write. This test pins that validation.
        let dir = temp_dir("containment");
        let outside = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-mods-containment-sibling-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("victim.txt"), "untouched").unwrap();

        let traversal_name = format!("..{}{}{}victim.txt", std::path::MAIN_SEPARATOR, outside.file_name().unwrap().to_string_lossy(), std::path::MAIN_SEPARATOR);
        let result = toggle_mod(dir.to_string_lossy().into_owned(), traversal_name, false);
        assert!(result.is_err());
        assert!(outside.join("victim.txt").exists());
        assert_eq!(fs::read_to_string(outside.join("victim.txt")).unwrap(), "untouched");
    }
}
