import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StoreListing, StoreSearchResult, StoreSourceInfo } from "../types/store";
import { StoreCard } from "./StoreCard";
import { track } from "../lib/analytics";

// The backend's error strings are accurate but Rust/reqwest-flavored
// ("error sending request for url (...): error trying to connect: ...").
// Keep the technical detail in the console for debugging, show a short
// human-readable message in the UI.
function friendlyStoreError(e: unknown): string {
  console.error("store search failed:", e);
  return "Couldn't reach the storefront. Check your connection and try again.";
}

// "" means "search every registered source" — matches the backend's
// `source: None` behavior in search_store (decision 0013).
const ALL_SOURCES = "";

// Warms the browser's HTTP cache for a page of cover art before the
// user ever sees it, so by the time loadMore() actually renders these
// cards, the <img> tags resolve instantly instead of popping in one
// by one. Plain Image() objects, never attached to the DOM — this is
// a cache-warming trick, not a preview.
function preloadCoverArt(listings: StoreListing[]) {
  for (const listing of listings) {
    if (!listing.cover_url) continue;
    const img = new Image();
    img.src = listing.cover_url;
  }
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
  const [sources, setSources] = useState<StoreSourceInfo[]>([]);
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES);

  // Bumped on every new search so a slow page-1 response that arrives after
  // the user has already typed something else doesn't clobber newer results.
  const searchToken = useRef(0);

  // The next page's data + warmed image cache, fetched in the
  // background one page ahead of what's on screen. Keyed by
  // searchToken so a stale prefetch from before a query/filter change
  // never gets used. loadMore() consumes this instead of hitting the
  // network when it's ready — that's the actual "instant" part.
  const prefetch = useRef<{ token: number; page: number; result: StoreSearchResult } | null>(null);

  const prefetchNextPage = useCallback(
    (afterPage: number, currentTotalPages: number, token: number) => {
      if (afterPage >= currentTotalPages) return;
      const trimmed = query.trim();
      invoke<StoreSearchResult>("search_store", {
        query: trimmed || null,
        page: afterPage + 1,
        includeNsfw: showNsfw,
        source: sourceFilter || null,
      })
        .then((result) => {
          if (searchToken.current !== token) return;
          preloadCoverArt(result.listings);
          prefetch.current = { token, page: result.page, result };
        })
        .catch(() => {
          // Best-effort only — loadMore() falls back to a normal
          // network request when there's nothing prefetched.
        });
    },
    [query, showNsfw, sourceFilter],
  );

  useEffect(() => {
    invoke<StoreSourceInfo[]>("list_store_sources")
      .then(setSources)
      .catch((e) => console.error("failed to list store sources:", e));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const token = ++searchToken.current;
    setLoading(true);
    setError(null);

    const handle = setTimeout(() => {
      if (trimmed !== "") track("store_searched");
      invoke<StoreSearchResult>("search_store", {
        query: trimmed || null,
        page: 1,
        includeNsfw: showNsfw,
        source: sourceFilter || null,
      })
        .then((result) => {
          if (searchToken.current !== token) return;
          setListings(result.listings);
          setPage(result.page);
          setTotalPages(result.total_pages);
          prefetch.current = null;
          prefetchNextPage(result.page, result.total_pages, token);
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
  }, [query, showNsfw, sourceFilter, prefetchNextPage]);

  async function loadMore() {
    const trimmed = query.trim();
    const token = searchToken.current;
    track("store_load_more_clicked");

    // The common case: the next page was already fetched (and its
    // cover art already warmed in the browser's HTTP cache) while the
    // user was looking at the current page. Apply it immediately, no
    // spinner, no network round-trip.
    const cached = prefetch.current;
    if (cached && cached.token === token && cached.page === page + 1) {
      prefetch.current = null;
      setListings((prev) => [...prev, ...cached.result.listings]);
      setPage(cached.result.page);
      setTotalPages(cached.result.total_pages);
      prefetchNextPage(cached.result.page, cached.result.total_pages, token);
      return;
    }

    setLoadingMore(true);
    try {
      const result = await invoke<StoreSearchResult>("search_store", {
        query: trimmed || null,
        page: page + 1,
        includeNsfw: showNsfw,
        source: sourceFilter || null,
      });
      if (searchToken.current !== token) return;
      setListings((prev) => [...prev, ...result.listings]);
      setPage(result.page);
      setTotalPages(result.total_pages);
      prefetchNextPage(result.page, result.total_pages, token);
    } catch (e) {
      if (searchToken.current === token) setError(friendlyStoreError(e));
    } finally {
      if (searchToken.current === token) setLoadingMore(false);
    }
  }

  return (
    <div className="store-view">
      <p className="store-disclosure">
        Browsing DRM-free catalogs from {sources.map((s) => s.display_name).join(", ") || "GOG"}.
        Purchases happen on the storefront's own site — this app never
        handles payment or fulfillment.
      </p>
      <div className="store-search-row">
        <input
          type="text"
          className="search-input store-search"
          placeholder="Search the DRM-free catalog..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        {sources.length > 1 && (
          <select
            className="store-source-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.currentTarget.value)}
          >
            <option value={ALL_SOURCES}>All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        )}
        <label className="store-nsfw-toggle">
          <input
            type="checkbox"
            checked={showNsfw}
            onChange={(e) => {
              const enabled = e.currentTarget.checked;
              setShowNsfw(enabled);
              track("store_nsfw_toggled", { enabled });
            }}
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
