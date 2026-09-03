import type { Game } from "../types/game";
import { GameCard } from "./GameCard";

interface GameListProps {
  games: Game[];
  onLaunch: (game: Game) => void;
  launchingId: string | null;
  providerLabels: Record<string, string>;
  hasAnyGames?: boolean;
  loading?: boolean;
  cacheVersion?: number;
  onMatchChecked?: () => void;
  /** Forwarded to GameCard — only acted on for manually-added games. */
  onRemoveManual?: (id: string) => void;
  /** Shown as a call-to-action on the "no installed games at all" empty
   *  state (not the "no search results" one) — a reviewer/new user
   *  with nothing installed yet would otherwise hit a dead end on
   *  first launch instead of seeing the app do anything. Optional so
   *  tests/consumers that don't care about the Store tab can omit it. */
  onBrowseStore?: () => void;
}

export function GameList({
  games,
  onLaunch,
  launchingId,
  providerLabels,
  hasAnyGames = games.length > 0,
  loading = false,
  cacheVersion,
  onMatchChecked,
  onRemoveManual,
  onBrowseStore,
}: GameListProps) {
  if (loading && games.length === 0) {
    return (
      <div className="game-list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="game-card game-card-skeleton">
            <div className="game-card-info">
              <div className="game-thumb skeleton-shimmer" />
              <div className="skeleton-line skeleton-shimmer" style={{ width: "10rem" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true">
          {hasAnyGames ? "🔍" : "🎮"}
        </span>
        <p>
          {hasAnyGames
            ? "No games match your search."
            : "No installed games found. Steam, GOG, and Epic titles installed on this machine will show up here automatically."}
        </p>
        {!hasAnyGames && onBrowseStore && (
          <button className="empty-state-cta" onClick={onBrowseStore}>
            Browse the DRM-free store instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="game-list">
      {games.map((game) => (
        <GameCard
          key={`${game.provider}:${game.id}`}
          game={game}
          onLaunch={onLaunch}
          launching={launchingId === `${game.provider}:${game.id}`}
          providerLabels={providerLabels}
          cacheVersion={cacheVersion}
          onMatchChecked={onMatchChecked}
          onRemoveManual={onRemoveManual}
        />
      ))}
    </div>
  );
}
