import type { Game } from "../types/game";

const PROVIDER_LABELS: Record<string, string> = {
  steam: "Steam",
  gog: "GOG",
  epic: "Epic",
};

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
}

export function GameCard({ game, onLaunch, launching }: GameCardProps) {
  return (
    <div className="game-card">
      <div className="game-card-info">
        <span className={`origin-badge origin-${game.provider}`}>
          {PROVIDER_LABELS[game.provider] ?? game.provider}
        </span>
        <span className="game-name">{game.name}</span>
      </div>
      <button disabled={launching} onClick={() => onLaunch(game)}>
        {launching ? "Launching..." : "Play"}
      </button>
    </div>
  );
}
