import type { Game } from "../types/game";

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
  providerLabels: Record<string, string>;
}

export function GameCard({ game, onLaunch, launching, providerLabels }: GameCardProps) {
  return (
    <div className="game-card">
      <div className="game-card-info">
        <span className={`origin-badge origin-${game.provider}`}>
          {providerLabels[game.provider] ?? game.provider}
        </span>
        <span className="game-name">{game.name}</span>
      </div>
      <button disabled={launching} onClick={() => onLaunch(game)}>
        {launching ? "Launching..." : "Play"}
      </button>
    </div>
  );
}
