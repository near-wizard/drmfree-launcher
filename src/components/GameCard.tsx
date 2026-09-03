import { useState } from "react";
import type { DrmStatus, Game } from "../types/game";

const DRM_LABELS: Record<DrmStatus, string> = {
  "drm-free": "DRM-Free",
  drm: "DRM",
  unknown: "DRM Unknown",
};

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
        <span className={`drm-badge drm-${game.drm_status}`}>
          {DRM_LABELS[game.drm_status]}
        </span>
        <span className="game-name">{game.name}</span>
      </div>
      <button disabled={launching} onClick={() => onLaunch(game)}>
        {launching ? "Launching..." : "Play"}
      </button>
    </div>
  );
}
