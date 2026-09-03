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
}

#[derive(Debug, Deserialize)]
struct CatalogPrice {
    #[serde(rename = "final")]
    final_: Option<String>,
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
#[tauri::command]
pub async fn search_store(query: Option<String>, page: Option<u32>) -> Result<StoreSearchResult, String> {
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

    Ok(to_search_result(parsed, page))
}

fn to_search_result(parsed: CatalogResponse, page: u32) -> StoreSearchResult {
    StoreSearchResult {
        listings: parsed.products.into_iter().map(to_listing).collect(),
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

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RESPONSE: &str = r#"{
        "products": [
            {
                "title": "The Witcher 3: Wild Hunt",
                "coverHorizontal": "https://images.gog-statics.com/witcher3.jpg",
                "price": { "final": "$9.99", "base": "$39.99" },
                "storeLink": "https://www.gog.com/en/game/the_witcher_3_wild_hunt"
            },
            {
                "title": "No Price Listed",
                "coverHorizontal": null,
                "price": null,
                "storeLink": "https://www.gog.com/en/game/no_price_listed"
            }
        ],
        "pages": 7,
        "productCount": 321
    }"#;

    #[test]
    fn parses_gog_catalog_response_shape() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        assert_eq!(parsed.pages, 7);
        assert_eq!(parsed.products.len(), 2);
    }

    #[test]
    fn maps_product_with_price_and_cover() {
        let parsed: CatalogResponse = serde_json::from_str(SAMPLE_RESPONSE).unwrap();
        let result = to_search_result(parsed, 1);

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
        let result = to_search_result(parsed, 1);

        let unpriced = &result.listings[1];
        assert_eq!(unpriced.price, None);
        assert_eq!(unpriced.cover_url, None);
    }
}
