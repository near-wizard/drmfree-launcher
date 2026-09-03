import { describe, it, expect } from "vitest";
import { freedomStats } from "./freedomStats";
import type { Game } from "../types/game";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "1",
    name: "Some Game",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "unknown", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

describe("freedomStats", () => {
  it("counts drm-free games out of the total", () => {
    const games = [
      makeGame({ id: "1", drm: { status: "drm-free", source: "gog", method: "gog_import", verified_on: "2026-01-01" } }),
      makeGame({ id: "2", drm: { status: "drm", source: null, method: null, verified_on: null } }),
      makeGame({ id: "3", drm: { status: "unknown", source: null, method: null, verified_on: null } }),
    ];
    expect(freedomStats(games)).toEqual({ free: 1, total: 3, pct: 33 });
  });

  it("returns zeroed stats for an empty library", () => {
    expect(freedomStats([])).toEqual({ free: 0, total: 0, pct: 0 });
  });

  it("rounds the percentage", () => {
    const games = [
      makeGame({ id: "1", drm: { status: "drm-free", source: "gog", method: "gog_import", verified_on: "2026-01-01" } }),
      makeGame({ id: "2", drm: { status: "drm-free", source: "gog", method: "gog_import", verified_on: "2026-01-01" } }),
      makeGame({ id: "3", drm: { status: "unknown", source: null, method: null, verified_on: null } }),
    ];
    expect(freedomStats(games).pct).toBe(67);
  });
});
