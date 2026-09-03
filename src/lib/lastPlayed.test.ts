import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordLaunch, lastPlayedAt, loadLastPlayedMap } from "./lastPlayed";

describe("lastPlayed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns undefined for a game that was never launched", () => {
    expect(lastPlayedAt("steam", "123")).toBeUndefined();
  });

  it("records a launch and reads it back", () => {
    const before = Date.now();
    recordLaunch("steam", "123");
    const at = lastPlayedAt("steam", "123");
    expect(at).toBeGreaterThanOrEqual(before);
  });

  it("keys by provider+id, not id alone", () => {
    recordLaunch("steam", "123");
    expect(lastPlayedAt("gog", "123")).toBeUndefined();
  });

  it("loadLastPlayedMap reflects every recorded launch", () => {
    recordLaunch("steam", "1");
    recordLaunch("gog", "2");
    const map = loadLastPlayedMap();
    expect(Object.keys(map).sort()).toEqual(["gog:2", "steam:1"]);
  });

  it("degrades to a no-op instead of throwing when localStorage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => recordLaunch("steam", "1")).not.toThrow();
    spy.mockRestore();
  });

  it("treats corrupt stored JSON as empty rather than throwing", () => {
    localStorage.setItem("drmfree-launcher:last-played", "{not json");
    expect(lastPlayedAt("steam", "1")).toBeUndefined();
    expect(loadLastPlayedMap()).toEqual({});
  });
});
