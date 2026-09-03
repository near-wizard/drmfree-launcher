import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StoreListing, StoreSearchResult } from "../types/store";
import { StoreCard } from "./StoreCard";

// The backend's error strings are accurate but Rust/reqwest-flavored
// ("error sending request for url (...): error trying to connect: ...").
// Keep the technical detail in the console for debugging, show a short
// human-readable message in the UI.
function friendlyStoreError(e: unknown): string {
  console.error("store search failed:", e);
  return "Couldn't reach GOG's catalog. Check your connection and try again.";
}

export function StoreView() {
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNsfw, setShowNsfw] = useState(false);

  // Bumped on every new search so a slow page-1 response that arrives after
  // the user has already typed something else doesn't clobber newer results.
  const searchToken = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const token = ++searchToken.current;
    setLoading(true);
    setError(null);

    const handle = setTimeout(() => {
      invoke<StoreSearchResult>("search_store", {
        query: trimmed || null,
        page: 1,
        includeNsfw: showNsfw,
      })
        .then((result) => {
          if (searchToken.current !== token) return;
          setListings(result.listings);
          setPage(result.page);
          setTotalPages(result.total_pages);
        })
        .catch((e) => {
          if (searchToken.current !== token) return;
          setError(friendlyStoreError(e));
        })
        .finally(() => {
          if (searchToken.current === token) setLoading(false);
        });
    }, 300);

    return () => clearTimeout(handle);
  }, [query, showNsfw]);

  async function loadMore() {
    const trimmed = query.trim();
    const token = searchToken.current;
    setLoadingMore(true);
    try {
      const result = await invoke<StoreSearchResult>("search_store", {
        query: trimmed || null,
        page: page + 1,
        includeNsfw: showNsfw,
      });
      if (searchToken.current !== token) return;
      setListings((prev) => [...prev, ...result.listings]);
      setPage(result.page);
      setTotalPages(result.total_pages);
    } catch (e) {
      if (searchToken.current === token) setError(friendlyStoreError(e));
    } finally {
      if (searchToken.current === token) setLoadingMore(false);
    }
  }

  return (
    <div className="store-view">
      <p className="store-disclosure">
        Browsing GOG's DRM-free catalog. Purchases happen on gog.com — this
        app never handles payment or fulfillment.
      </p>
      <div className="store-search-row">
        <input
          type="text"
          className="search-input store-search"
          placeholder="Search GOG's DRM-free catalog..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <label className="store-nsfw-toggle">
          <input
            type="checkbox"
            checked={showNsfw}
            onChange={(e) => setShowNsfw(e.currentTarget.checked)}
          />
          Show NSFW
        </label>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {loading ? (
        <div className="store-grid" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="store-card store-card-skeleton">
              <div className="store-card-cover skeleton-shimmer" />
              <div className="store-card-body">
                <div className="skeleton-line skeleton-shimmer" style={{ width: "85%" }} />
                <div className="skeleton-line skeleton-shimmer" style={{ width: "40%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            🔍
          </span>
          <p>No results.</p>
        </div>
      ) : (
        <>
          <div className="store-grid">
            {listings.map((listing, i) => (
              <StoreCard key={`${listing.store_url}:${i}`} listing={listing} />
            ))}
          </div>
          {page < totalPages && (
            <div className="store-load-more">
              <button onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <span className="spinner" aria-hidden="true" />}
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
