import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DrmDeterminationMethod, DrmRecord, DrmStatus, Game } from "../types/game";

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

// Steam app IDs map directly to a public CDN header image; no API key needed.
function steamCoverArtUrl(game: Game): string | null {
  if (game.provider !== "steam") return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${game.id}/header.jpg`;
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

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
  providerLabels: Record<string, string>;
}

export function GameCard({ game, onLaunch, launching, providerLabels }: GameCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [gogCoverUrl, setGogCoverUrl] = useState<string | null>(null);

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

  const coverUrl = steamCoverArtUrl(game) ?? gogCoverUrl;

  return (
    <div className="game-card">
      <div className="game-card-info">
        {coverUrl && !imageFailed ? (
          <img
            className="game-thumb"
            src={coverUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="game-thumb game-thumb-placeholder" aria-hidden="true">
            {game.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`origin-badge origin-${game.provider}`}>
          {providerLabels[game.provider] ?? game.provider}
        </span>
        <span className={`drm-badge drm-${game.drm.status}`} title={drmTooltip(game.drm)}>
          {DRM_LABELS[game.drm.status]}
        </span>
        <span className="game-name">{game.name}</span>
      </div>
      <button disabled={launching} onClick={() => onLaunch(game)}>
        {launching ? "Launching..." : "Play"}
      </button>
    </div>
  );
}
