import { useState } from "react";
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
// Other providers don't expose an equivalent local-install-derivable image source.
function coverArtUrl(game: Game): string | null {
  if (game.provider === "steam") {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${game.id}/header.jpg`;
  }
  return null;
}

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
  providerLabels: Record<string, string>;
}

export function GameCard({ game, onLaunch, launching, providerLabels }: GameCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const coverUrl = coverArtUrl(game);

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
