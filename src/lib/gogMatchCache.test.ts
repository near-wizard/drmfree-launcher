import { describe, it, expect, beforeEach } from "vitest";
import { getCachedMatch, recordMatch, clearCachedMatch } from "./gogMatchCache";

describe("gogMatchCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns undefined for an uncached game", () => {
    expect(getCachedMatch("steam", "1")).toBeUndefined();
  });

  it("records a found match with its store URL and a checkedAt timestamp", () => {
    const before = Date.now();
    recordMatch("steam", "1", { status: "found", storeUrl: "https://gog.com/game/1" });
    const entry = getCachedMatch("steam", "1");
    expect(entry).toMatchObject({ status: "found", storeUrl: "https://gog.com/game/1" });
    expect(entry!.checkedAt).toBeGreaterThanOrEqual(before);
  });

  it("records a not-found match", () => {
    recordMatch("steam", "1", { status: "not-found" });
    expect(getCachedMatch("steam", "1")).toMatchObject({ status: "not-found" });
  });

  it("keys by provider+id, not id alone", () => {
    recordMatch("steam", "1", { status: "found", storeUrl: "https://gog.com/game/1" });
    expect(getCachedMatch("gog", "1")).toBeUndefined();
  });

  it("clearCachedMatch removes only the targeted entry", () => {
    recordMatch("steam", "1", { status: "found", storeUrl: "https://gog.com/game/1" });
    recordMatch("gog", "2", { status: "not-found" });
    clearCachedMatch("steam", "1");
    expect(getCachedMatch("steam", "1")).toBeUndefined();
    expect(getCachedMatch("gog", "2")).toMatchObject({ status: "not-found" });
  });

  it("clearCachedMatch on a missing entry is a no-op, not an error", () => {
    expect(() => clearCachedMatch("steam", "does-not-exist")).not.toThrow();
  });
});
