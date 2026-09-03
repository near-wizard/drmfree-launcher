import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkGogMatch, type CheckResult } from "../lib/gogUpgradeCheck";
import { getCachedMatch } from "../lib/gogMatchCache";
import { loadSavedSteamId, parseSteamId64, saveSteamId } from "../lib/wishlistId";
import { track } from "../lib/analytics";
import { PawIcon } from "../components/PawIcon";
import { CompareDealModal } from "../components/CompareDealModal";
import type { WishlistGame } from "../types/wishlist";

// Mirrors WISHLIST_ITEM_CAP in src-tauri/src/providers/steam.rs —
// there's no wire-level signal for "the backend truncated this," so
// this is an approximation (a wishlist of exactly 60 items would also
// trigger it) rather than an exact match. Good enough for a soft
// notice; keep the two numbers in sync by hand if either changes.
const WISHLIST_ITEM_CAP = 60;

type MatchState = { status: "checking" } | CheckResult;

function friendlyWishlistError(e: unknown): string {
  console.error("wishlist load failed:", e);
  return String(e);
}

export function WishlistView() {
  const [input, setInput] = useState(() => loadSavedSteamId() ?? "");
  const [inputError, setInputError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [games, setGames] = useState<WishlistGame[] | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchState>>({});
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);
  const [compareGame, setCompareGame] = useState<WishlistGame | null>(null);

  async function runMatchChecks(items: WishlistGame[]) {
    setCheckProgress({ done: 0, total: items.length });
    const seeded: Record<string, MatchState> = {};
    for (const item of items) {
      const cached = getCachedMatch("steam", item.appid);
      if (cached) {
        seeded[item.appid] =
          cached.status === "found"
            ? { status: "found", storeUrl: cached.storeUrl!, price: cached.price ?? null }
            : { status: "not-found" };
      } else {
        seeded[item.appid] = { status: "checking" };
      }
    }
    setMatches(seeded);

    const toCheck = items.filter((item) => !getCachedMatch("steam", item.appid));
    for (let i = 0; i < toCheck.length; i++) {
      const item = toCheck[i];
      const result = await checkGogMatch({ provider: "steam", id: item.appid, name: item.name });
      setMatches((prev) => ({ ...prev, [item.appid]: result.status === "error" ? { status: "not-found" } : result }));
      setCheckProgress({ done: i + 1, total: toCheck.length });
      if (i < toCheck.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    setCheckProgress(null);
  }

  async function loadWishlist(e: FormEvent) {
    e.preventDefault();
    const steamId = parseSteamId64(input);
    if (!steamId) {
      setInputError(
        "That doesn't look like a SteamID64 — it's the 17-digit number in your profile URL " +
          "(steamcommunity.com/profiles/<this part>). Vanity /id/ URLs aren't supported.",
      );
      return;
    }
    setInputError(null);
    saveSteamId(steamId);
    setLoading(true);
    setLoadError(null);
    setGames(null);
    setMatches({});
    track("wishlist_loaded");
    try {
      const result = await invoke<WishlistGame[]>("get_steam_wishlist", { steamId });
      setGames(result);
      if (result.length > 0) runMatchChecks(result);
    } catch (err) {
      setLoadError(friendlyWishlistError(err));
    } finally {
      setLoading(false);
    }
  }

  const foundCount = Object.values(matches).filter((m) => m.status === "found").length;

  return (
    <div className="wishlist-view">
      <p className="store-disclosure">
        Paste your SteamID64 to see which of your wishlisted titles already have a DRM-free
        version on GOG — before you buy the locked one. Your wishlist must be set to Public in
        Steam's privacy settings. Nothing here is sent anywhere except a read-only request to
        Steam and GOG's own public catalogs.
      </p>
      <form className="wishlist-form" onSubmit={loadWishlist}>
        <input
          type="text"
          className="search-input wishlist-id-input"
          placeholder="SteamID64 or profile URL"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
        />
        <button type="submit" disabled={loading}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Loading..." : "Load wishlist"}
        </button>
      </form>
      {inputError && <p className="error-banner">{inputError}</p>}
      {loadError && <p className="error-banner">{loadError}</p>}

      {games !== null && games.length === 0 && !loadError && (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            🔍
          </span>
          <p>
            No public wishlist items found. Make sure your wishlist is set to Public under Steam's
            privacy settings, then try again.
          </p>
        </div>
      )}

      {games !== null && games.length > 0 && (
        <>
          {checkProgress ? (
            <div className="upgrade-summary-bar">
              <span className="upgrade-check-status">
                <span className="spinner" aria-hidden="true" />
                Checking GOG for DRM-free versions... ({checkProgress.done}/{checkProgress.total})
              </span>
            </div>
          ) : (
            foundCount > 0 && (
              <div className="upgrade-summary-bar">
                <span className="upgrade-summary-count">
                  {foundCount} DRM-free version{foundCount === 1 ? "" : "s"} found
                </span>
              </div>
            )
          )}
          {games.length >= WISHLIST_ITEM_CAP && (
            <p className="wishlist-cap-note">
              Showing your first {WISHLIST_ITEM_CAP} wishlist items.
            </p>
          )}
          <div className="store-grid">
            {games.map((game) => {
              const match = matches[game.appid];
              return (
                <div className="store-card wishlist-card" key={game.appid}>
                  {game.cover_url ? (
                    <img className="store-card-cover" src={game.cover_url} alt="" loading="lazy" />
                  ) : (
                    <div className="store-card-cover store-card-cover-placeholder" aria-hidden="true">
                      {game.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="store-card-body">
                    <span className="store-card-title">{game.name}</span>
                    {!match && <span className="wishlist-card-status">Not checked</span>}
                    {match?.status === "checking" && (
                      <span className="wishlist-card-status">
                        <span className="spinner" aria-hidden="true" />
                        Checking...
                      </span>
                    )}
                    {match?.status === "not-found" && (
                      <span className="wishlist-card-status">No DRM-free match found</span>
                    )}
                  </div>
                  {match?.status === "found" && (
                    <div className="wishlist-card-actions">
                      <button
                        onClick={() => {
                          track("wishlist_buy_clicked");
                          openUrl(match.storeUrl);
                        }}
                      >
                        <PawIcon />
                        Buy DRM-free on GOG
                      </button>
                      <button className="upgrade-compare-button" onClick={() => setCompareGame(game)}>
                        Compare
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {compareGame &&
        matches[compareGame.appid]?.status === "found" &&
        (() => {
          const match = matches[compareGame.appid] as { status: "found"; storeUrl: string; price: string | null };
          return (
            <CompareDealModal
              gameName={compareGame.name}
              lockedProviderId="steam"
              lockedProviderLabel="Steam"
              lockedGameId={compareGame.appid}
              gogStoreUrl={match.storeUrl}
              gogPrice={match.price}
              onClose={() => setCompareGame(null)}
            />
          );
        })()}
    </div>
  );
}
