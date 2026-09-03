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
            : "No installed games found. Steam and GOG titles installed on this machine will show up here automatically."}
        </p>
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
          launching={launchingId === game.id}
          providerLabels={providerLabels}
          cacheVersion={cacheVersion}
          onMatchChecked={onMatchChecked}
        />
      ))}
    </div>
  );
}
