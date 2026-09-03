import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { clearCachedMatch, getCachedMatch } from "../lib/gogMatchCache";
import { checkGogMatch } from "../lib/gogUpgradeCheck";
import { getCommunityConsensus } from "../lib/community";
import { applyCommunityConsensus } from "../lib/communityConsensus";
import { track } from "../lib/analytics";
import { PawIcon } from "./PawIcon";
import { CommunityReport } from "./CommunityReport";
import type { DrmDeterminationMethod, DrmRecord, DrmStatus, Game } from "../types/game";
import type { CommunityConsensus } from "../types/community";

const DRM_LABELS: Record<DrmStatus, string> = {
  "drm-free": "DRM-Free",
  drm: "DRM",
  unknown: "DRM Unknown",
};

const DETERMINATION_LABELS: Record<DrmDeterminationMethod, string> = {
  gog_import: "GOG storefront policy",
  publisher_declared: "publisher declared",
  community_review: "community review",
  manual_review: "manual review",
};

// Surfaced as a tooltip, not the badge itself — decision 0008 exists
// because "DRM-Free" alone doesn't say whether that's a verified fact
// or a storefront-level default, so the provenance is one hover away
// rather than hidden entirely.
function drmTooltip(drm: DrmRecord): string {
  if (!drm.source || !drm.method) {
    return "No verified DRM source yet for this title (see decision 0008).";
  }
  const verified = drm.verified_on ? ` · verified ${drm.verified_on}` : "";
  return `Source: ${drm.source} (${DETERMINATION_LABELS[drm.method]})${verified}`;
}

// Most Steam app IDs map directly to this public CDN header image with
// no network round trip beyond the image itself — no API key needed,
// so this is tried first. It's a guess, not a guarantee: newer titles
// are served from a per-title hashed path this can't predict (real
// examples: "Mage Arena", "MECCHA CHAMELEON"), so the <img> tag's
// onError falls back to fetchSteamCoverArtFallback below rather than
// giving up straight to the placeholder.
function steamCoverArtUrl(game: Game): string | null {
  if (game.provider !== "steam") return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${game.id}/header.jpg`;
}

// Cached across cards/re-renders like gogCoverArtCache below — only
// hit for the subset of Steam titles the fast guess above misses.
const steamCoverArtFallbackCache = new Map<string, string | null>();

async function fetchSteamCoverArtFallback(id: string): Promise<string | null> {
  if (steamCoverArtFallbackCache.has(id)) return steamCoverArtFallbackCache.get(id) ?? null;
  const url = await invoke<string | null>("get_steam_cover_art", { id }).catch(() => null);
  steamCoverArtFallbackCache.set(id, url);
  return url;
}

// GOG has no equivalent deterministic-URL CDN, but the registry ID we
// already read for gog-provider games is the same ID GOG's public
// product API (api.gog.com/products/<id>) uses — an exact lookup, not
// a name-matching guess. That's a network round-trip rather than a
// plain <img src>, so results are cached across cards/re-renders
// (module-level, not component state — cards remount on list re-sort).
const gogCoverArtCache = new Map<string, string | null>();

async function fetchGogCoverArt(id: string): Promise<string | null> {
  if (gogCoverArtCache.has(id)) return gogCoverArtCache.get(id) ?? null;
  const url = await invoke<string | null>("get_gog_cover_art", { id }).catch(() => null);
  gogCoverArtCache.set(id, url);
  return url;
}

// On-demand, not automatic — checking every installed game against
// GOG's catalog the moment the library loads would mean dozens of
// outbound requests on every launch for a large library. This is the
// first consumer of decision 0006's "buy DRM-free version" loop, kept
// deliberately opt-in per game (decision 0002's non-invasive spirit).
// Results persist in localStorage (gogMatchCache) so a check made in
// one session doesn't need repeating in the next.
type UpgradeCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; storeUrl: string }
  | { status: "not-found" };

function initialUpgradeState(game: Game): UpgradeCheckState {
  const cached = getCachedMatch(game.provider, game.id);
  if (!cached) return { status: "idle" };
  return cached.status === "found"
    ? { status: "found", storeUrl: cached.storeUrl! }
    : { status: "not-found" };
}

function GogUpgradeCheck({ game, onChecked }: { game: Game; onChecked?: () => void }) {
  const [state, setState] = useState<UpgradeCheckState>(() => initialUpgradeState(game));

  async function check() {
    setState({ status: "checking" });
    track("gog_check_clicked", { provider: game.provider });
    const result = await checkGogMatch(game);
    // A network/API failure isn't the same as a confirmed "no match" —
    // reset to idle so the next click retries instead of getting stuck
    // showing a false negative (checkGogMatch doesn't cache errors).
    setState(result.status === "error" ? { status: "idle" } : result);
    if (result.status !== "error") {
      track("gog_check_result", { found: result.status === "found" });
    }
    onChecked?.();
  }

  function recheck() {
    clearCachedMatch(game.provider, game.id);
    check();
  }

  switch (state.status) {
    case "idle":
      return (
        <button className="upgrade-check-button" onClick={check}>
          Check GOG
        </button>
      );
    case "checking":
      return (
        <span className="upgrade-check-status">
          <span className="spinner" aria-hidden="true" />
          Checking...
        </span>
      );
    case "found":
      return (
        <span className="upgrade-check-status">
          <button
            className="upgrade-found-button"
            onClick={() => {
              track("upgrade_buy_clicked", { provider: game.provider });
              openUrl(state.storeUrl);
            }}
          >
            <PawIcon />
            Buy DRM-free on GOG
          </button>
          <button className="upgrade-recheck-button" onClick={recheck} title="Check again">
            ↻
          </button>
        </span>
      );
    case "not-found":
      return (
        <span className="upgrade-check-status">
          No GOG match found
          <button className="upgrade-recheck-button" onClick={recheck} title="Check again">
            ↻
          </button>
        </span>
      );
  }
}

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
  providerLabels: Record<string, string>;
  /** Bumped after a library-wide bulk check so GogUpgradeCheck remounts
   *  and re-reads gogMatchCache instead of staying on its stale "idle"
   *  state from before the bulk check ran. */
  cacheVersion?: number;
  /** Called after this card's own "Check GOG"/recheck resolves, so the
   *  library-wide match-count summary updates without waiting for a
   *  bulk check. */
  onMatchChecked?: () => void;
}

export function GameCard({
  game,
  onLaunch,
  launching,
  providerLabels,
  cacheVersion,
  onMatchChecked,
}: GameCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [gogCoverUrl, setGogCoverUrl] = useState<string | null>(null);
  const [steamFallbackUrl, setSteamFallbackUrl] = useState<string | null>(null);
  const [steamFallbackTried, setSteamFallbackTried] = useState(false);
  const [consensus, setConsensus] = useState<CommunityConsensus | null>(null);
  const [consensusLoaded, setConsensusLoaded] = useState(false);

  useEffect(() => {
    if (game.provider !== "gog") return;
    let cancelled = false;
    fetchGogCoverArt(game.id).then((url) => {
      if (!cancelled) setGogCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  // Fetched once here (not inside CommunityReport) since the badge
  // below also needs it — a game with no local DRM determination at
  // all falls back to what the community has agreed on, closing the
  // gap decisions 0008/0014 left open (see communityConsensus.ts).
  useEffect(() => {
    let cancelled = false;
    getCommunityConsensus(game.provider, game.id).then((c) => {
      if (cancelled) return;
      setConsensus(c);
      setConsensusLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  const coverUrl = steamFallbackUrl ?? steamCoverArtUrl(game) ?? gogCoverUrl;
  const effectiveDrm = applyCommunityConsensus(game.drm, consensus);

  // The fast-guess Steam URL failing isn't necessarily "no image" —
  // try the real lookup once before falling back to the placeholder.
  // GOG/no-cover cases have nothing further to try, so they go
  // straight to imageFailed as before.
  function onCoverError() {
    if (game.provider === "steam" && !steamFallbackTried) {
      setSteamFallbackTried(true);
      fetchSteamCoverArtFallback(game.id).then((url) => {
        if (url) setSteamFallbackUrl(url);
        else setImageFailed(true);
      });
      return;
    }
    setImageFailed(true);
  }

  return (
    <div className="game-card">
      <div className="game-card-info">
        {coverUrl && !imageFailed ? (
          <img
            className="game-thumb"
            src={coverUrl}
            alt=""
            loading="lazy"
            onError={onCoverError}
          />
        ) : (
          <span className="game-thumb game-thumb-placeholder" aria-hidden="true">
            {game.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`origin-badge origin-${game.provider}`}>
          {providerLabels[game.provider] ?? game.provider}
        </span>
        <span className={`drm-badge drm-${effectiveDrm.status}`} title={drmTooltip(effectiveDrm)}>
          {DRM_LABELS[effectiveDrm.status]}
        </span>
        <span className="game-name">{game.name}</span>
      </div>
      <div className="game-card-actions">
        {consensusLoaded && consensus !== null && (
          <CommunityReport game={game} consensus={consensus} onReported={setConsensus} />
        )}
        {game.provider !== "gog" && (
          <GogUpgradeCheck key={cacheVersion} game={game} onChecked={onMatchChecked} />
        )}
        {game.install_dir && (
          <button
            className="open-folder-button"
            title="Open install folder"
            aria-label="Open install folder"
            onClick={() => {
              track("open_install_folder_clicked", { provider: game.provider });
              invoke("open_install_folder", { provider: game.provider, id: game.id }).catch((e) =>
                console.error("failed to open install folder:", e),
              );
            }}
          >
            📂
          </button>
        )}
        <button className="play-button" disabled={launching} onClick={() => onLaunch(game)}>
          {!launching && <PawIcon />}
          {launching ? "Launching..." : "Play"}
        </button>
      </div>
    </div>
  );
}
