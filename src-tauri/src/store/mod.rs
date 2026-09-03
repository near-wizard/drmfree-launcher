//! Stage 2a: DRM-free storefront discovery (see docs/roadmap.md and
//! docs/decisions/0005-drm-free-only-catalog.md). Read-only, link-out only —
//! no fulfillment, no in-app checkout. Deliberately has zero shared code
//! with `providers/` (the local-library scan).
//!
//! Multiple storefronts can plug in here (decision 0013): GOG is the only
//! real implementation today, but itch.io, a curated list of DRM-free Steam
//! titles, and eventual direct/first-party deals are all expected to
//! implement `StoreSource` the same way GOG does. Adding one means writing
//! a new module + registering it in `all_store_sources` — nothing else in
//! this file, `commands.rs`, or the frontend needs to change; the frontend
//! already treats `store` as a plain string, not a fixed enum.

pub mod gog;

use async_trait::async_trait;
use serde::Serialize;

/// Base URL of a deployed `drmfree-redirect` instance (e.g.
/// `https://go.drmfreegames.example`), baked in at compile time via
/// `option_env!` — same pattern as `COMMUNITY_API_URL` in
/// `community.rs` and the PostHog key in `src/lib/analytics.ts`.
/// Unset in ordinary `cargo build`/dev, so "Buy" links point straight
/// at the storefront until a real deployment sets this in CI; nothing
/// here needs to change once it is (see decision 0011 and
/// `drmfree-redirect`'s README).
fn affiliate_redirect_base_url() -> Option<&'static str> {
    option_env!("AFFILIATE_REDIRECT_URL")
}

/// Rewrites a storefront URL to route through the affiliate redirect
/// service's `/go?url=<dest>` endpoint when one is configured;
/// otherwise returns the URL unchanged. The redirect service itself
/// decides whether to attach a tracking tag (falls back to a plain
/// pass-through redirect if no affiliate template is configured on
/// its end either) — this function's only job is deciding whether to
/// route through it at all.
fn apply_affiliate_redirect(store_url: &str) -> String {
    redirect_through(store_url, affiliate_redirect_base_url())
}

/// The actual rewrite, with the base URL passed in rather than read
/// from `option_env!` directly — split out purely so the `Some(base)`
/// branch is unit-testable without a compile-time env var, which
/// `cargo test` has no way to set per-test.
fn redirect_through(store_url: &str, base: Option<&str>) -> String {
    match base {
        Some(base) => {
            let encoded: String = url::form_urlencoded::byte_serialize(store_url.as_bytes()).collect();
            format!("{base}/go?url={encoded}")
        }
        None => store_url.to_string(),
    }
}

/// A single storefront listing, normalized for the UI regardless of which
/// source produced it. Every entry on screen must be clearly attributed to
/// its source per decision 0006's "Buy on GOG"-style labeling requirement
/// — hence `store` always being populated, never inferred client-side.
#[derive(Debug, Serialize)]
pub struct StoreListing {
    pub title: String,
    pub price: Option<String>,
    pub cover_url: Option<String>,
    pub store_url: String,
    pub store: &'static str,
}

/// One page of results, plus enough pagination state for the UI to offer
/// "load more" without re-deriving it from the listings themselves. When a
/// search spans multiple sources, `total_pages` is the max across sources
/// (see `search_store`) — an approximation, not an exact merged count.
#[derive(Debug, Serialize)]
pub struct StoreSearchResult {
    pub listings: Vec<StoreListing>,
    pub page: u32,
    pub total_pages: u32,
}

/// A store source the frontend can list/select, e.g. for a source filter.
#[derive(Debug, Serialize)]
pub struct StoreSourceInfo {
    pub id: &'static str,
    pub display_name: &'static str,
}

/// Abstraction over "a place to browse DRM-free games and link out to buy
/// them", mirroring how `providers::GameProvider` abstracts local-library
/// detection. Every source is read-only/link-out only — no source
/// implementation should ever handle payment or fulfillment itself (see
/// module docs above and decision 0005).
#[async_trait]
pub trait StoreSource: Send + Sync {
    /// Stable machine-readable id, e.g. "gog". Used as `StoreListing.store`
    /// and as the `source` filter in `search_store`.
    fn id(&self) -> &'static str;

    /// Human-readable name, e.g. "GOG".
    fn display_name(&self) -> &'static str;

    /// `query` filters by search term; `None`/empty is a source-defined
    /// default listing (GOG returns trending titles). `page` is 1-based.
    /// `include_nsfw` is a request, not a guarantee — sources without any
    /// adult-content concept can ignore it.
    async fn search(
        &self,
        query: Option<&str>,
        page: u32,
        include_nsfw: bool,
    ) -> Result<StoreSearchResult, String>;
}

/// All store sources wired into the app. Add new sources here only.
fn all_store_sources() -> Vec<Box<dyn StoreSource>> {
    vec![Box::new(gog::GogStoreSource)]
}

#[tauri::command]
pub fn list_store_sources() -> Vec<StoreSourceInfo> {
    all_store_sources()
        .iter()
        .map(|s| StoreSourceInfo {
            id: s.id(),
            display_name: s.display_name(),
        })
        .collect()
}

/// Searches one source (`source` = its id) or, when omitted, every
/// registered source, merging the results. A single source's failure
/// doesn't fail the whole search as long as at least one other source
/// succeeded — a flaky/down storefront shouldn't blank out the Store tab
/// once more than one source is active. Errors only propagate when every
/// selected source failed.
#[tauri::command]
pub async fn search_store(
    query: Option<String>,
    page: Option<u32>,
    include_nsfw: Option<bool>,
    source: Option<String>,
) -> Result<StoreSearchResult, String> {
    let page = page.unwrap_or(1).max(1);
    let include_nsfw = include_nsfw.unwrap_or(false);
    let sources = all_store_sources();

    let selected: Vec<&Box<dyn StoreSource>> = match source.as_deref() {
        Some(id) => sources.iter().filter(|s| s.id() == id).collect(),
        None => sources.iter().collect(),
    };

    if selected.is_empty() {
        return Err(format!(
            "unknown store source: {}",
            source.unwrap_or_default()
        ));
    }

    let mut listings = Vec::new();
    let mut total_pages = 1;
    let mut errors = Vec::new();

    for s in &selected {
        match s.search(query.as_deref(), page, include_nsfw).await {
            Ok(mut result) => {
                total_pages = total_pages.max(result.total_pages);
                for listing in &mut result.listings {
                    listing.store_url = apply_affiliate_redirect(&listing.store_url);
                }
                listings.extend(result.listings);
            }
            Err(e) => errors.push(format!("{}: {e}", s.id())),
        }
    }

    if listings.is_empty() && !errors.is_empty() {
        return Err(errors.join("; "));
    }

    Ok(StoreSearchResult {
        listings,
        page,
        total_pages,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redirect_through_passes_url_unchanged_when_no_base_configured() {
        assert_eq!(
            redirect_through("https://www.gog.com/game/foo", None),
            "https://www.gog.com/game/foo"
        );
    }

    #[test]
    fn redirect_through_wraps_and_percent_encodes_the_destination() {
        let result = redirect_through(
            "https://www.gog.com/game/foo?bar=baz&qux=1",
            Some("https://go.example.com"),
        );
        assert_eq!(
            result,
            "https://go.example.com/go?url=https%3A%2F%2Fwww.gog.com%2Fgame%2Ffoo%3Fbar%3Dbaz%26qux%3D1"
        );
    }

    #[test]
    fn redirect_through_strips_trailing_slash_expectation_not_assumed() {
        // Base URLs are expected without a trailing slash (matches
        // drmfree-redirect's README example) — this documents that a
        // trailing slash would produce a double slash rather than
        // silently normalizing it, so a misconfigured env var fails
        // loud (broken link) rather than working by accident.
        let result = redirect_through("https://www.gog.com/game/foo", Some("https://go.example.com/"));
        assert_eq!(result, "https://go.example.com//go?url=https%3A%2F%2Fwww.gog.com%2Fgame%2Ffoo");
    }
}
