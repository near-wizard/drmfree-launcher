import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkGogMatch } from "./gogUpgradeCheck";
import { getCachedMatch } from "./gogMatchCache";
import type { Game } from "../types/game";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "1",
    name: "Risk of Rain",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "drm", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

describe("checkGogMatch", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("caches and returns a found match", async () => {
    invokeMock.mockResolvedValue({ store_url: "https://gog.com/game/ror" });
    const result = await checkGogMatch(makeGame());
    expect(result).toEqual({ status: "found", storeUrl: "https://gog.com/game/ror" });
    expect(getCachedMatch("steam", "1")).toMatchObject({ status: "found" });
  });

  it("caches and returns not-found when the backend has no match", async () => {
    invokeMock.mockResolvedValue(null);
    const result = await checkGogMatch(makeGame());
    expect(result).toEqual({ status: "not-found" });
    expect(getCachedMatch("steam", "1")).toMatchObject({ status: "not-found" });
  });

  it("does not cache an error, so a transient failure can be retried", async () => {
    invokeMock.mockRejectedValue(new Error("network down"));
    const result = await checkGogMatch(makeGame());
    expect(result).toEqual({ status: "error" });
    expect(getCachedMatch("steam", "1")).toBeUndefined();
  });

  it("passes the game's display name as the lookup title", async () => {
    invokeMock.mockResolvedValue(null);
    await checkGogMatch(makeGame({ name: "Hollow Knight" }));
    expect(invokeMock).toHaveBeenCalledWith("find_gog_match", { title: "Hollow Knight" });
  });
});
