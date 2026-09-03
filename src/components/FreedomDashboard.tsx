import { freedomStats } from "../lib/freedomStats";
import type { Game } from "../types/game";

export function FreedomDashboard({ games }: { games: Game[] }) {
  const { free, total, pct } = freedomStats(games);
  if (total === 0) return null;

  return (
    <div className="freedom-dashboard" role="group" aria-label="Library DRM-free progress">
      <div className="freedom-dashboard-label">
        <span>
          <strong>{free}</strong> of <strong>{total}</strong> game{total === 1 ? "" : "s"} are
          DRM-free
        </span>
        <span className="freedom-dashboard-pct">{pct}%</span>
      </div>
      <div className="freedom-dashboard-track" aria-hidden="true">
        <div className="freedom-dashboard-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
