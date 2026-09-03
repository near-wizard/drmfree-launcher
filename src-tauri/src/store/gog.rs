//! GOG storefront source (see docs/roadmap.md and
//! docs/decisions/0005-drm-free-only-catalog.md). Read-only, link-out only —
//! no fulfillment, no in-app checkout. Deliberately has zero shared code
//! with `providers/` (the local-library scan): this module only talks to
//! GOG's public catalog API, so it's a clean lift-and-shift into a separate
//! service later if/when affiliate credentials or Stage 2b direct deals
//! need a real backend (see docs/decisions/0001-open-core-split.md).
//!
//! The first (and, as of decision 0013, only real) implementation of the
//! `StoreSource` trait — see `super` for the trait itself and how
//! additional sources (itch.io, curated DRM-free Steam titles, direct
//! deals) are expected to plug in alongside this one.

use super::{StoreListing, StoreSearchResult, StoreSource};
use async_trait::async_trait;
use serde::Deserialize;

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

/// The GOG catalog source. Talks to GOG's public catalog API (no API key —
/// the same endpoint gog.com's own storefront uses).
pub struct GogStoreSource;

#[async_trait]
impl StoreSource for GogStoreSource {
    fn id(&self) -> &'static str {
        "gog"
    }

    fn display_name(&self) -> &'static str {
        "GOG"
    }

    /// `query` filters by search term; `None`/empty returns trending
    /// titles. `page` is 1-based. `include_nsfw` defaults to `false` —
    /// GOG's `pages`/`total_pages` count is unfiltered, so a filtered page
    /// can come back smaller than `limit`.
    async fn search(
        &self,
        query: Option<&str>,
        page: u32,
        include_nsfw: bool,
    ) -> Result<StoreSearchResult, String> {
        let page_str = page.to_string();

        let client = crate::http::client();
        let mut req = client.get(CATALOG_URL).query(&[
            ("limit", "48"),
            ("locale", "en-US"),
            ("currency", "USD"),
            ("page", page_str.as_str()),
        ]);

        match query.map(str::trim) {
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

        Ok(to_search_result(parsed, page, include_nsfw))
    }
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
        store: "GOG",
    }
}

/// Strips patterns confirmed (empirically, against the real API — not
/// assumed) to corrupt GOG's search relevance rather than just get
/// filtered by it: a trailing "(YYYY)" disambiguation year (Steam's
/// own listing name for e.g. "Risk of Rain (2013)" vs GOG's plain
/// "Risk of Rain" — searching the literal "(2013)" returns *zero*
/// results) and trademark/registered/copyright symbols (searching
/// "Rocket League®" returns unrelated results, not Rocket League).
/// Also collapses whitespace. Deliberately NOT stripping words like
/// "Edition"/"Demo"/"Bundle", or parentheticals in general — decision
/// 0006 flags exactly that kind of over-eager normalization as the
/// false-positive risk to avoid (a real Steam library surfaced "Half
/// Sword Demo", which must not match a paid "Half Sword" entry).
fn clean_search_query(title: &str) -> String {
    strip_trailing_year_suffix(title)
        .chars()
        .filter(|c| !matches!(c, '™' | '®' | '©'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Same cleaning as `clean_search_query`, plus lowercasing, for
/// case-insensitive exact-match comparison against fetched results.
fn normalize_title(title: &str) -> String {
    clean_search_query(title).to_lowercase()
}

/// Strips a trailing `(YYYY)` (exactly 4 ASCII digits) from a title,
/// if present. Narrower than stripping parentheticals in general: an
/// edition/bundle qualifier like "(Definitive Edition)" isn't 4
/// digits and is left alone.
fn strip_trailing_year_suffix(title: &str) -> String {
    let trimmed = title.trim_end();
    let Some(before_paren) = trimmed.strip_suffix(')') else {
        return title.to_string();
    };
    let Some(open) = before_paren.rfind('(') else {
        return title.to_string();
    };
    let inner = &before_paren[open + 1..];
    if inner.len() == 4 && inner.bytes().all(|b| b.is_ascii_digit()) {
        before_paren[..open].trim_end().to_string()
    } else {
        title.to_string()
    }
}

/// Finds an exact-title match for a locally-detected game in GOG's
/// catalog — the first (deliberately conservative) implementation of
/// decision 0006's title-matching mechanism. Exact match only (modulo
/// case/whitespace/trademark-symbol noise), checked against page 1 of
/// results only: a false "DRM-free version available" prompt on the
/// wrong title is worse than occasionally missing a real match, and a
/// real match for an exact title is expected to rank near the top of
/// GOG's own search relevance anyway.
///
/// Investigated widening this (2026-09) and deliberately didn't:
/// - Checked whether GOG's catalog uses curly quotes/en-dashes that
///   might cause false *negatives* against Steam's straight-ASCII
///   title strings — confirmed empirically against the real API
///   (searched several apostrophe'd titles) that it doesn't; GOG
///   consistently uses plain ASCII punctuation. Nothing to normalize.
/// - Considered prefix matching (treat catalog title as a match if it
///   starts with the local title plus a boundary character, e.g. local
///   "Cyberpunk 2077" matching catalog "Cyberpunk 2077: Ultimate
///   Edition") to catch edition-qualifier suffixes. Rejected: this
///   reintroduces exactly the false-positive risk decision 0006 warns
///   about, just via a different mechanism than "Demo" — local "Dark
///   Souls" would incorrectly prefix-match catalog "Dark Souls II",
///   a genuinely different game, not an edition of the same one.
///   Distinguishing real edition qualifiers ("Definitive Edition",
///   "Remastered") from sequel/distinct-entry indicators ("II", ": The
///   Sands of Time") generically is a harder problem than this
///   deserves to be solved blind — a curated qualifier allowlist, not
///   a prefix rule, is the safe path if this gets revisited.
#[tauri::command]
pub async fn find_gog_match(title: String) -> Result<Option<StoreListing>, String> {
    let query = clean_search_query(&title);
    let result = GogStoreSource.search(Some(&query), 1, false).await?;
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
        assert_eq!(witcher.store, "GOG");
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
    fn normalize_title_strips_trailing_year_disambiguation_suffix() {
        // Real case: Steam's own listing name is "Risk of Rain (2013)"
        // (disambiguating from Risk of Rain 2); GOG lists the same game
        // as plain "Risk of Rain" — a storefront naming convention, not
        // a different product.
        assert_eq!(normalize_title("Risk of Rain (2013)"), normalize_title("Risk of Rain"));
    }

    #[test]
    fn normalize_title_does_not_strip_non_year_parentheticals() {
        // An edition/qualifier in parens changes what product this is —
        // must not be treated the same as a disambiguation year.
        assert_ne!(
            normalize_title("Prince of Persia (Definitive Edition)"),
            normalize_title("Prince of Persia")
        );
    }

    #[test]
    fn clean_search_query_strips_year_suffix_and_trademark_symbols() {
        // Confirmed against the real API: GOG's search returns zero
        // results for the literal "Risk of Rain (2013)" query, and
        // unrelated results for "Rocket League®" — these aren't just
        // filtered out locally, they corrupt the search itself, so the
        // query sent to GOG must already be cleaned, not just the
        // fetched results compared afterward.
        assert_eq!(clean_search_query("Risk of Rain (2013)"), "Risk of Rain");
        assert_eq!(clean_search_query("Rocket League®"), "Rocket League");
    }

    #[test]
    fn find_exact_match_matches_case_and_symbol_insensitively() {
        let listings = vec![listing("The Witcher™ 3: Wild Hunt"), listing("Cyberpunk 2077")];
        let found = find_exact_match(listings, "the witcher 3: wild hunt");
        assert_eq!(found.map(|l| l.title), Some("The Witcher™ 3: Wild Hunt".to_string()));
    }

    #[test]
    fn find_exact_match_matches_across_a_year_disambiguation_suffix() {
        let listings = vec![listing("Risk of Rain")];
        let found = find_exact_match(listings, "Risk of Rain (2013)");
        assert_eq!(found.map(|l| l.title), Some("Risk of Rain".to_string()));
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
