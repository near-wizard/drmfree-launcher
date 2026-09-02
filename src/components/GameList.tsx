import type { Game } from "../types/game";
import { GameCard } from "./GameCard";

interface GameListProps {
  games: Game[];
  onLaunch: (game: Game) => void;
  launchingId: string | null;
  providerLabels: Record<string, string>;
  hasAnyGames?: boolean;
}

export function GameList({
  games,
  onLaunch,
  launchingId,
  providerLabels,
  hasAnyGames = games.length > 0,
}: GameListProps) {
  if (games.length === 0) {
    return (
      <p className="empty-state">
        {hasAnyGames
          ? "No games match your search."
          : "No installed games found. Steam and GOG titles installed on this machine will show up here automatically."}
      </p>
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
        />
      ))}
    </div>
  );
}
