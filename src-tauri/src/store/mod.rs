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
            Ok(result) => {
                total_pages = total_pages.max(result.total_pages);
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
