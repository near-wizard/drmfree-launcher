import type { Game } from "../types/game";

// Deliberately counts only a game's own recorded status, not a
// community-consensus-promoted one (see communityConsensus.ts) — this
// stat is meant to reflect what's actually verified for this library,
// not a majority-vote guess, so it stays a conservative floor rather
// than the more optimistic number GameCard's individual badges can
// show.
export function freedomStats(games: Game[]): { free: number; total: number; pct: number } {
  const total = games.length;
  const free = games.filter((g) => g.drm.status === "drm-free").length;
  const pct = total === 0 ? 0 : Math.round((free / total) * 100);
  return { free, total, pct };
}
