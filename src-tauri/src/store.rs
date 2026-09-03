//! Stage 2a: DRM-free storefront discovery (see docs/roadmap.md and
//! docs/decisions/0005-drm-free-only-catalog.md). Read-only, link-out only —
//! no fulfillment, no in-app checkout. Deliberately has zero shared code
//! with `providers/` (the local-library scan): this module only talks to
//! GOG's public catalog API, so it's a clean lift-and-shift into a separate
//! service later if/when affiliate credentials or Stage 2b direct deals
//! need a real backend (see docs/decisions/0001-open-core-split.md).

use serde::{Deserialize, Serialize};

const CATALOG_URL: &str = "https://catalog.gog.com/v1/catalog";

#[derive(Debug, Deserialize)]
struct CatalogResponse {
    products: Vec<CatalogProduct>,
    pages: u32,
}

#[derive(Debug, Deserialize)]
struct CatalogProduct {
    title: String,
    #[serde(rename = "coverHorizontal")]
    cover_horizontal: Option<String>,
    price: Option<CatalogPrice>,
    #[serde(rename = "storeLink")]
    store_link: String,
    #[serde(default)]
    tags: Vec<CatalogTag>,
}

#[derive(Debug, Deserialize)]
struct CatalogPrice {
    #[serde(rename = "final")]
    final_: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CatalogTag {
    slug: String,
}

/// GOG tag slugs that flag adult/sexual content specifically. Deliberately
/// narrower than "Mature" alone, which GOG also applies to games that are
/// just violent/dark themed (e.g. Cyberpunk 2077, The Witcher 3) — those
/// aren't what an "NSFW" toggle is expected to hide.
const NSFW_TAG_SLUGS: &[&str] = &["nsfw", "sexual-content", "nudity"];

fn is_nsfw(product: &CatalogProduct) -> bool {
    product
        .tags
        .iter()
        .any(|t| NSFW_TAG_SLUGS.contains(&t.slug.as_str()))
}

/// A single storefront listing, already normalized for the UI. Every entry
/// on screen must be clearly attributed to GOG per decision 0006's "Buy on
/// GOG" labeling requirement — hence `store` being a fixed literal rather
/// than something dynamic once more storefronts are added.
#[derive(Debug, Serialize)]
pub struct StoreListing {
    pub title: String,
    pub price: Option<String>,
    pub cover_url: Option<String>,
    pub store_url: String,
    pub store: &'static str,
}

/// One page of catalog results, plus enough pagination state for the UI to
/// offer "load more" without re-deriving it from the listings themselves.
#[derive(Debug, Serialize)]
pub struct StoreSearchResult {
    pub listings: Vec<StoreListing>,
    pub page: u32,
    pub total_pages: u32,
}

/// Fetches DRM-free listings from GOG's public catalog API (no API key —
/// this is the same endpoint gog.com's own storefront uses). `query` filters
/// by search term; `None`/empty returns trending titles. `page` is 1-based.
/// `include_nsfw` defaults to `false` — GOG's `pages`/`total_pages` count is
/// unfiltered, so a filtered page can come back smaller than `limit`.
#[tauri::command]
pub async fn search_store(
    query: Option<String>,
    page: Option<u32>,
    include_nsfw: Option<bool>,
) -> Result<StoreSearchResult, String> {
    let page = page.unwrap_or(1).max(1);
    let page_str = page.to_string();

    let client = reqwest::Client::new();
    let mut req = client.get(CATALOG_URL).query(&[
        ("limit", "48"),
        ("locale", "en-US"),
        ("currency", "USD"),
        ("page", page_str.as_str()),
    ]);

    match query.as_deref().map(str::trim) {
        Some(q) if !q.is_empty() => req = req.query(&[("query", q)]),
        _ => req = req.query(&[("order", "desc:trending")]),
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("failed to reach GOG catalog: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GOG catalog returned an error: {e}"))?;

    let parsed: CatalogResponse = response
        .json()
        .await
        .map_err(|e| format!("failed to parse GOG catalog response: {e}"))?;

    Ok(to_search_result(parsed, page, include_nsfw.unwrap_or(false)))
}

fn to_search_result(parsed: CatalogResponse, page: u32, include_nsfw: bool) -> StoreSearchResult {
    StoreSearchResult {
        listings: parsed
            .products
            .into_iter()
            .filter(|p| include_nsfw || !is_nsfw(p))
            .map(to_listing)
            .collect(),
        page,
        total_pages: parsed.pages,
    }
}

fn to_listing(p: CatalogProduct) -> StoreListing {
    StoreListing {
        title: p.title,
        price: p.price.and_then(|price| price.final_),
        cover_url: p.cover_horizontal,
        store_url: p.store_link,
        store: "gog",
    }
}

/// Normalizes a title for exact-match comparison: case-insensitive,
/// strips trademark/registered/copyright marks, collapses whitespace.
/// Deliberately NOT stripping words like "Edition"/"Demo"/"Bundle" —
/// decision 0006 flags exactly that kind of over-eager normalization
/// as the false-positive risk to avoid (a real Steam library surfaced
/// "Half Sword Demo", which must not match a paid "Half Sword" entry).
fn normalize_title(title: &str) -> String {
    title
        .chars()
        .filter(|c| !matches!(c, '™' | '®' | '©'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Finds an exact-title match for a locally-detected game in GOG's
/// catalog — the first (deliberately conservative) implementation of
/// decision 0006's title-matching mechanism. Exact match only (modulo
/// case/whitespace/trademark-symbol noise), checked against page 1 of
/// results only: a false "DRM-free version available" prompt on the
/// wrong title is worse than occasionally missing a real match, and a
/// real match for an exact title is expected to rank near the top of
/// GOG's own search relevance anyway.
#[tauri::command]
pub async fn find_gog_match(title: String) -> Result<Option<StoreListing>, String> {
    let result = search_store(Some(title.clone()), Some(1), Some(false)).await?;
    Ok(find_exact_match(result.listings, &title))
}

fn find_exact_match(listings: Vec<StoreListing>, title: &str) -> Option<StoreListing> {
    let target = normalize_title(title);
    listings
        .into_iter()
        .find(|listing| normalize_title(&listing.title) == target)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RESPONSE: &str = r#"{
        "products": [
            {
                "title": "The Witcher 3: Wild Hunt",
                "coverHorizontal": "https://images.gog-statics.com/witcher3.jpg",
                "price": { "final": "$9.99", "base": "$39.99" },
                "storeLink": "https://www.gog.com/en/game/the_witcher_3_wild_hunt",
                "tags": [{ "name": "Mature", "slug": "mature" }]
            },
            {
                "title": "No Price Listed",
                "coverHorizontal": null,
                "price": null,
                "storeLink": "https://www.gog.com/en/game/no_price_listed"
            },
            {
                "title": "Being a DIK - Season 1",
                "coverHorizontal": "https://images.gog-statics.com/dik.jpg",
                "price": { "final": "$6.99" },
                "storeLink": "https://www.gog.com/en/game/being_a_dik_season_1",
                "tags": [
                    { "name": "Mature", "slug": "mature" },
                    { "name": "Sexual Content", "slug": "sexual-content" },
                    { "name": "Nudity", "slug": "nudity" },
                    { "name": "NSFW", "slug": "nsfw" }
                ]
            }
        ],
        "pages": 7,
        "productCount": 321
    }"#;

    #[test]
    fn parses_gog_catalog_response_shape() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        assert_eq!(parsed.pages, 7);
        assert_eq!(parsed.products.len(), 3);
    }

    #[test]
    fn maps_product_with_price_and_cover() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1, true);

        assert_eq!(result.page, 1);
        assert_eq!(result.total_pages, 7);

        let witcher = &result.listings[0];
        assert_eq!(witcher.title, "The Witcher 3: Wild Hunt");
        assert_eq!(witcher.price.as_deref(), Some("$9.99"));
        assert_eq!(
            witcher.cover_url.as_deref(),
            Some("https://images.gog-statics.com/witcher3.jpg")
        );
        assert_eq!(
            witcher.store_url,
            "https://www.gog.com/en/game/the_witcher_3_wild_hunt"
        );
        // Every listing must be attributed to GOG (decision 0006 labeling).
        assert_eq!(witcher.store, "gog");
    }

    #[test]
    fn maps_product_missing_price_and_cover_to_none_not_panic() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1, true);

        let unpriced = &result.listings[1];
        assert_eq!(unpriced.price, None);
        assert_eq!(unpriced.cover_url, None);
    }

    #[test]
    fn excludes_nsfw_tagged_products_by_default() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1, false);

        assert_eq!(result.listings.len(), 2);
        assert!(result.listings.iter().all(|l| l.title != "Being a DIK - Season 1"));
    }

    #[test]
    fn mature_tag_alone_is_not_treated_as_nsfw() {
        // "Mature" covers violence/dark themes too broadly (e.g. The
        // Witcher 3) to be what an NSFW toggle is expected to hide.
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1, false);

        assert!(result.listings.iter().any(|l| l.title == "The Witcher 3: Wild Hunt"));
    }

    #[test]
    fn includes_nsfw_tagged_products_when_requested() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1, true);

        assert_eq!(result.listings.len(), 3);
        assert!(result.listings.iter().any(|l| l.title == "Being a DIK - Season 1"));
    }

    fn listing(title: &str) -> StoreListing {
        StoreListing {
            title: title.to_string(),
            price: None,
            cover_url: None,
            store_url: format!("https://www.gog.com/en/game/{title}"),
            store: "gog",
        }
    }

    #[test]
    fn normalize_title_is_case_and_whitespace_insensitive() {
        assert_eq!(
            normalize_title("  The   Witcher™ 3: Wild Hunt  "),
            normalize_title("the witcher 3: wild hunt")
        );
    }

    #[test]
    fn normalize_title_strips_trademark_symbols_only() {
        assert_eq!(normalize_title("Rocket League®"), "rocket league");
    }

    #[test]
    fn find_exact_match_matches_case_and_symbol_insensitively() {
        let listings = vec![listing("The Witcher™ 3: Wild Hunt"), listing("Cyberpunk 2077")];
        let found = find_exact_match(listings, "the witcher 3: wild hunt");
        assert_eq!(found.map(|l| l.title), Some("The Witcher™ 3: Wild Hunt".to_string()));
    }

    #[test]
    fn find_exact_match_does_not_match_a_demo_against_the_full_game() {
        // The exact false-positive decision 0006 calls out by name: a
        // locally-detected "Half Sword Demo" must not match a paid
        // "Half Sword" catalog entry just because they share a prefix.
        let listings = vec![listing("Half Sword")];
        let found = find_exact_match(listings, "Half Sword Demo");
        assert!(found.is_none());
    }

    #[test]
    fn find_exact_match_returns_none_when_no_listing_matches() {
        let listings = vec![listing("Some Other Game")];
        assert!(find_exact_match(listings, "Untitled Goose Game").is_none());
    }
}
