use super::{DrmRecord, Game, GameProvider};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub struct SteamProvider;

impl GameProvider for SteamProvider {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn display_name(&self) -> &'static str {
        "Steam"
    }

    fn detect_installed_games(&self) -> Vec<Game> {
        let Some(steam_root) = find_steam_root() else {
            return Vec::new();
        };

        library_folders(&steam_root)
            .iter()
            .flat_map(|lib| games_in_library(lib))
            .collect()
    }

    fn launch(&self, game: &Game) -> Result<(), String> {
        // Native protocol handoff only — Steam itself decides how to
        // launch the game. We never touch the game binary.
        let uri = format!("steam://rungameid/{}", game.id);
        open_uri(&uri)
    }
}

#[derive(Debug, Deserialize)]
struct SteamAppDetailsData {
    name: Option<String>,
    header_image: Option<String>,
    #[serde(default)]
    is_free: bool,
    price_overview: Option<SteamPriceOverview>,
}

#[derive(Debug, Deserialize)]
struct SteamPriceOverview {
    final_formatted: String,
}

#[derive(Debug, Deserialize)]
struct SteamAppDetailsEntry {
    success: bool,
    data: Option<SteamAppDetailsData>,
}

/// Fallback cover-art lookup for the (increasing) share of Steam titles
/// whose header image isn't at the old predictable
/// `cdn.akamai.steamstatic.com/steam/apps/<id>/header.jpg` path —
/// GameCard's <img> tries that URL directly first since it needs no
/// network round trip beyond the image itself, and only calls this when
/// that 404s. Newer titles are served from a per-title hashed path
/// under `shared.akamai.steamstatic.com/store_item_assets/...` that
/// can't be guessed, only read back from Steam's own public appdetails
/// API — confirmed live via two real user-reported titles ("Mage
/// Arena", "MECCHA CHAMELEON") that 404 on every old-style CDN path
/// guess but resolve correctly through this endpoint.
#[tauri::command]
pub async fn get_steam_cover_art(id: String) -> Result<Option<String>, String> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={id}&filters=basic");
    let response = crate::http::client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("failed to reach Steam appdetails API: {e}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let parsed: HashMap<String, SteamAppDetailsEntry> = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Steam appdetails response: {e}"))?;

    Ok(extract_header_image(&parsed, &id))
}

/// Powers the per-game price line in CompareDealModal — `filters=basic`
/// alone (used by the other appdetails calls above/below) does NOT
/// include `price_overview`; it has to be requested explicitly
/// (confirmed live: identical request without this token comes back
/// with the field simply absent, not empty). Kept as its own command
/// rather than folded into get_steam_cover_art so cards that never
/// open Compare don't pay for the extra payload on every mount.
#[tauri::command]
pub async fn get_steam_price(id: String) -> Result<Option<String>, String> {
    let url =
        format!("https://store.steampowered.com/api/appdetails?appids={id}&filters=basic,price_overview");
    let response = crate::http::client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("failed to reach Steam appdetails API: {e}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let parsed: HashMap<String, SteamAppDetailsEntry> = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Steam appdetails response: {e}"))?;

    Ok(extract_price(&parsed, &id))
}

fn extract_price(parsed: &HashMap<String, SteamAppDetailsEntry>, id: &str) -> Option<String> {
    let data = parsed.get(id).filter(|entry| entry.success).and_then(|entry| entry.data.as_ref())?;
    if data.is_free {
        return Some("Free to Play".to_string());
    }
    data.price_overview.as_ref().map(|p| p.final_formatted.clone())
}

fn extract_header_image(
    parsed: &HashMap<String, SteamAppDetailsEntry>,
    id: &str,
) -> Option<String> {
    parsed
        .get(id)
        .filter(|entry| entry.success)
        .and_then(|entry| entry.data.as_ref())
        .and_then(|data| data.header_image.clone())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WishlistGame {
    pub appid: String,
    pub name: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WishlistItemRaw {
    appid: u64,
}

#[derive(Debug, Deserialize, Default)]
struct WishlistResponseInner {
    #[serde(default)]
    items: Vec<WishlistItemRaw>,
}

#[derive(Debug, Deserialize)]
struct WishlistResponse {
    #[serde(default)]
    response: WishlistResponseInner,
}

// Steam wishlists can run into the hundreds of items; each one needs a
// separate appdetails round trip below (the wishlist API itself only
// returns appid/priority/date_added, never a title — see
// extract_name/fetch_app_details). Capping keeps this command's worst-
// case latency bounded and stays well inside Steam's unpublished rate
// limits for the appdetails endpoint, matching the "lightweight, not a
// scraper" spirit elsewhere in this codebase — the UI notes the cap
// when it's hit rather than silently truncating.
const WISHLIST_ITEM_CAP: usize = 60;

fn valid_steamid64(id: &str) -> bool {
    id.len() == 17 && id.chars().all(|c| c.is_ascii_digit())
}

/// Steam's wishlist visibility is a separate opt-in from profile
/// visibility (most accounts default to private) — a private or empty
/// wishlist and a malformed id are both indistinguishable from "zero
/// items" in the API's own response, so this always returns `Ok` with
/// however many items came back rather than trying to guess which case
/// it was; the UI copy covers both possibilities in one message.
#[tauri::command]
pub async fn get_steam_wishlist(steam_id: String) -> Result<Vec<WishlistGame>, String> {
    if !valid_steamid64(&steam_id) {
        return Err(
            "That doesn't look like a SteamID64 — it should be a 17-digit number, found on your \
             profile URL (steamcommunity.com/profiles/<this part>). Vanity /id/ URLs aren't \
             supported without a Steam API key."
                .to_string(),
        );
    }

    let url = format!("https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid={steam_id}");
    let response = crate::http::client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("failed to reach Steam's wishlist API: {e}"))?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let parsed: WishlistResponse = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Steam wishlist response: {e}"))?;

    let mut games = Vec::new();
    for item in parsed.response.items.into_iter().take(WISHLIST_ITEM_CAP) {
        let appid = item.appid.to_string();
        if let Ok(Some((name, cover_url))) = fetch_app_name_and_cover(&appid).await {
            games.push(WishlistGame { appid, name, cover_url });
        }
    }
    Ok(games)
}

async fn fetch_app_name_and_cover(id: &str) -> Result<Option<(String, Option<String>)>, String> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={id}&filters=basic");
    let response = crate::http::client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("failed to reach Steam appdetails API: {e}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let parsed: HashMap<String, SteamAppDetailsEntry> = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Steam appdetails response: {e}"))?;

    Ok(extract_name_and_cover(&parsed, id))
}

fn extract_name_and_cover(
    parsed: &HashMap<String, SteamAppDetailsEntry>,
    id: &str,
) -> Option<(String, Option<String>)> {
    let data = parsed.get(id).filter(|entry| entry.success).and_then(|entry| entry.data.as_ref())?;
    let name = data.name.clone()?;
    Some((name, data.header_image.clone()))
}

/// Locates the Steam client's install root, per OS. Returns `None` when
/// Steam isn't installed — that's a normal, expected outcome, not an error.
fn find_steam_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        windows_steam_root()
    }

    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|h| h.join("Library/Application Support/Steam"))
    }

    #[cfg(target_os = "linux")]
    {
        linux_steam_root()
    }
    .filter(|p: &PathBuf| p.exists())
}

#[cfg(target_os = "windows")]
fn windows_steam_root() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            return Some(PathBuf::from(path));
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey in ["SOFTWARE\\WOW6432Node\\Valve\\Steam", "SOFTWARE\\Valve\\Steam"] {
        if let Ok(key) = hklm.open_subkey(subkey) {
            if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                return Some(PathBuf::from(path));
            }
        }
    }

    None
}

#[cfg(target_os = "linux")]
fn linux_steam_root() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    [
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".var/app/com.valvesoftware.Steam/data/Steam"),
    ]
    .into_iter()
    .find(|p| p.exists())
}

/// Every library path (default + user-added drives) via
/// `steamapps/libraryfolders.vdf`, falling back to just the root.
///
/// `libraryfolders.vdf` lists the default library's own path alongside
/// any extra ones, so dedup by canonical path — not raw `PathBuf`
/// equality, which misses same-directory entries that differ only in
/// case or slash style (Steam writes the vdf value verbatim from
/// wherever the library was added, which need not match how we joined
/// `steam_root` ourselves) and would otherwise double-scan a library,
/// duplicating every game in it.
fn library_folders(steam_root: &Path) -> Vec<PathBuf> {
    let default_lib = steam_root.join("steamapps");
    let vdf_path = default_lib.join("libraryfolders.vdf");

    let Ok(contents) = fs::read_to_string(&vdf_path) else {
        return vec![default_lib];
    };

    let mut seen_canonical = std::collections::HashSet::new();
    seen_canonical.insert(canonical_or_self(&default_lib));
    let mut libraries = vec![default_lib];

    for value in extract_quoted_values(&contents, "path") {
        let lib = PathBuf::from(value).join("steamapps");
        if !lib.exists() {
            continue;
        }
        if seen_canonical.insert(canonical_or_self(&lib)) {
            libraries.push(lib);
        }
    }
    libraries
}

fn canonical_or_self(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Parses every `appmanifest_*.acf` in a `steamapps` directory into a `Game`.
fn games_in_library(steamapps_dir: &Path) -> Vec<Game> {
    let Ok(entries) = fs::read_dir(steamapps_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with("appmanifest_") && name.ends_with(".acf")
        })
        .filter_map(|e| fs::read_to_string(e.path()).ok())
        .filter_map(|contents| {
            let appid = extract_quoted_values(&contents, "appid").into_iter().next()?;
            let name = extract_quoted_values(&contents, "name").into_iter().next()?;
            let installdir = extract_quoted_values(&contents, "installdir").into_iter().next();
            Some(Game {
                id: appid,
                name,
                provider: "steam",
                install_dir: installdir.map(|d| {
                    steamapps_dir
                        .join("common")
                        .join(d)
                        .to_string_lossy()
                        .to_string()
                }),
                exe_path: None,
                // Steam already has a CDN-guess + fallback cover-art
                // lookup (see get_steam_cover_art below); no need for
                // the exe-icon fallback.
                icon_source: None,
                drm: DrmRecord::unknown(),
                drm_axes: None,
            })
        })
        .collect()
}

/// Minimal, tolerant reader for Valve's VDF key-value format — good enough
/// for the flat `"key"    "value"` pairs found in .acf/.vdf manifests
/// without pulling in a full VDF parser dependency for Stage 0.
fn extract_quoted_values(contents: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{key}\"");
    contents
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with(&needle) {
                return None;
            }
            let rest = &trimmed[needle.len()..];
            let mut parts = rest.splitn(3, '"');
            parts.next(); // leading whitespace before opening quote
            parts.next() // the value between quotes
        })
        .map(|s| s.to_string())
        .collect()
}

fn open_uri(uri: &str) -> Result<(), String> {
    open::that(uri).map_err(|e| format!("failed to open {uri}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drmfree-launcher-test-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extract_header_image_returns_url_on_success() {
        let json = r#"{"3716600":{"success":true,"data":{"header_image":"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3716600/e09e178465c67642c1214736e29d64846d966e52/header.jpg?t=1754585254"}}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(
            extract_header_image(&parsed, "3716600").as_deref(),
            Some("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3716600/e09e178465c67642c1214736e29d64846d966e52/header.jpg?t=1754585254")
        );
    }

    #[test]
    fn extract_header_image_is_none_when_success_is_false() {
        // Real shape for an unknown/delisted appid — no "data" key at
        // all, not an empty object.
        let json = r#"{"99999999999":{"success":false}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(extract_header_image(&parsed, "99999999999"), None);
    }

    #[test]
    fn extract_header_image_is_none_when_id_not_in_response() {
        let parsed: HashMap<String, SteamAppDetailsEntry> = HashMap::new();
        assert_eq!(extract_header_image(&parsed, "123"), None);
    }

    #[test]
    fn extract_price_returns_formatted_price_for_a_paid_game() {
        let json = r#"{"1086940":{"success":true,"data":{"is_free":false,"price_overview":{"final_formatted":"$59.99"}}}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(extract_price(&parsed, "1086940").as_deref(), Some("$59.99"));
    }

    #[test]
    fn extract_price_returns_free_to_play_label_for_free_games() {
        // Real shape: is_free: true with no price_overview key at all,
        // not a $0.00 price_overview — confirmed live against
        // Counter-Strike 2 (appid 730).
        let json = r#"{"730":{"success":true,"data":{"is_free":true}}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(extract_price(&parsed, "730").as_deref(), Some("Free to Play"));
    }

    #[test]
    fn extract_price_is_none_when_success_is_false() {
        let json = r#"{"1":{"success":false}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(extract_price(&parsed, "1"), None);
    }

    #[test]
    fn extract_name_and_cover_returns_both_on_success() {
        let json = r#"{"3716600":{"success":true,"data":{"name":"Mage Arena","header_image":"https://example.com/header.jpg"}}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(
            extract_name_and_cover(&parsed, "3716600"),
            Some(("Mage Arena".to_string(), Some("https://example.com/header.jpg".to_string())))
        );
    }

    #[test]
    fn extract_name_and_cover_keeps_name_even_without_cover() {
        let json = r#"{"1":{"success":true,"data":{"name":"No Cover Game"}}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(
            extract_name_and_cover(&parsed, "1"),
            Some(("No Cover Game".to_string(), None))
        );
    }

    #[test]
    fn extract_name_and_cover_is_none_when_success_is_false() {
        let json = r#"{"1":{"success":false}}"#;
        let parsed: HashMap<String, SteamAppDetailsEntry> = serde_json::from_str(json).unwrap();
        assert_eq!(extract_name_and_cover(&parsed, "1"), None);
    }

    #[test]
    fn valid_steamid64_accepts_17_digit_numeric_id() {
        assert!(valid_steamid64("76561197960287930"));
    }

    #[test]
    fn valid_steamid64_rejects_vanity_and_malformed_input() {
        assert!(!valid_steamid64("near-wizard")); // vanity name, not an id
        assert!(!valid_steamid64("123")); // too short
        assert!(!valid_steamid64("")); // empty
        assert!(!valid_steamid64("7656119796028793a")); // non-digit char
    }

    #[test]
    fn wishlist_response_parses_real_shape_with_items() {
        let json = r#"{"response":{"items":[{"appid":3716600,"priority":0,"date_added":1700000000},{"appid":4704690,"priority":1,"date_added":1700000001}]}}"#;
        let parsed: WishlistResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.response.items.len(), 2);
        assert_eq!(parsed.response.items[0].appid, 3716600);
    }

    #[test]
    fn wishlist_response_parses_empty_response_object() {
        // Real shape for a private or genuinely empty wishlist —
        // `{"response":{}}`, no "items" key at all, not an error.
        let json = r#"{"response":{}}"#;
        let parsed: WishlistResponse = serde_json::from_str(json).unwrap();
        assert!(parsed.response.items.is_empty());
    }

    #[test]
    fn extract_quoted_values_reads_matching_keys_only() {
        let contents = r#"
            "AppState"
            {
                "appid"        "440"
                "universe"        "1"
                "name"        "Team Fortress 2"
            }
        "#;
        assert_eq!(extract_quoted_values(contents, "appid"), vec!["440"]);
        assert_eq!(
            extract_quoted_values(contents, "name"),
            vec!["Team Fortress 2"]
        );
        // A key that's a superstring of another must not false-match.
        assert!(extract_quoted_values(contents, "app").is_empty());
    }

    #[test]
    fn extract_quoted_values_collects_multiple_matches() {
        let contents = r#"
            "path"        "C:\SteamLibrary"
            "path"        "D:\SteamLibrary"
        "#;
        assert_eq!(
            extract_quoted_values(contents, "path"),
            vec!["C:\\SteamLibrary", "D:\\SteamLibrary"]
        );
    }

    #[test]
    fn games_in_library_parses_appmanifest_files() {
        let steamapps = temp_dir("games-in-library");
        fs::write(
            steamapps.join("appmanifest_440.acf"),
            r#"
            "AppState"
            {
                "appid"        "440"
                "name"        "Team Fortress 2"
                "installdir"        "Team Fortress 2"
            }
            "#,
        )
        .unwrap();
        // Non-manifest files must be ignored.
        fs::write(steamapps.join("libraryfolders.vdf"), "\"path\" \"C:\\\\Elsewhere\"").unwrap();

        let games = games_in_library(&steamapps);

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "440");
        assert_eq!(games[0].name, "Team Fortress 2");
        assert_eq!(games[0].provider, "steam");
        assert_eq!(
            games[0].install_dir,
            Some(
                steamapps
                    .join("common")
                    .join("Team Fortress 2")
                    .to_string_lossy()
                    .to_string()
            )
        );

        fs::remove_dir_all(&steamapps).unwrap();
    }

    #[test]
    fn games_in_library_skips_manifests_missing_required_fields() {
        let steamapps = temp_dir("missing-fields");
        fs::write(
            steamapps.join("appmanifest_1.acf"),
            "\"AppState\"\n{\n    \"appid\"    \"1\"\n}\n", // no "name"
        )
        .unwrap();

        assert!(games_in_library(&steamapps).is_empty());

        fs::remove_dir_all(&steamapps).unwrap();
    }

    #[test]
    fn library_folders_falls_back_to_root_when_vdf_missing() {
        let steam_root = temp_dir("no-vdf");
        let libs = library_folders(&steam_root);
        assert_eq!(libs, vec![steam_root.join("steamapps")]);
        fs::remove_dir_all(&steam_root).unwrap();
    }

    #[test]
    fn library_folders_includes_existing_paths_from_vdf() {
        let steam_root = temp_dir("with-vdf");
        let default_lib = steam_root.join("steamapps");
        fs::create_dir_all(&default_lib).unwrap();

        let extra_root = temp_dir("extra-library");
        fs::create_dir_all(extra_root.join("steamapps")).unwrap();

        let vdf = format!(
            "\"libraryfolders\"\n{{\n    \"1\"\n    {{\n        \"path\"        \"{}\"\n    }}\n}}\n",
            extra_root.to_string_lossy().replace('\\', "\\\\")
        );
        fs::write(default_lib.join("libraryfolders.vdf"), vdf).unwrap();

        let libs = library_folders(&steam_root);

        assert_eq!(libs, vec![default_lib.clone(), extra_root.join("steamapps")]);

        fs::remove_dir_all(&steam_root).unwrap();
        fs::remove_dir_all(&extra_root).unwrap();
    }

    #[test]
    fn library_folders_does_not_duplicate_default_library_listed_in_vdf() {
        // Steam's own libraryfolders.vdf lists the default library
        // alongside any extra ones. A prior bug compared raw `PathBuf`s
        // (steam_root.join("steamapps") vs. the vdf's own string form of
        // the same directory) which could disagree in case/slash style
        // and fail to dedup, double-scanning the library and duplicating
        // every game in it.
        let steam_root = temp_dir("vdf-lists-default");
        let default_lib = steam_root.join("steamapps");
        fs::create_dir_all(&default_lib).unwrap();

        let vdf = format!(
            "\"libraryfolders\"\n{{\n    \"0\"\n    {{\n        \"path\"        \"{}\"\n    }}\n}}\n",
            steam_root.to_string_lossy().replace('\\', "\\\\")
        );
        fs::write(default_lib.join("libraryfolders.vdf"), vdf).unwrap();

        let libs = library_folders(&steam_root);

        assert_eq!(libs, vec![default_lib.clone()]);

        fs::remove_dir_all(&steam_root).unwrap();
    }
}
