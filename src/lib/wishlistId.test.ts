import { describe, it, expect, beforeEach } from "vitest";
import { parseSteamId64, loadSavedSteamId, saveSteamId } from "./wishlistId";

describe("parseSteamId64", () => {
  it("accepts a bare 17-digit SteamID64", () => {
    expect(parseSteamId64("76561197960287930")).toBe("76561197960287930");
  });

  it("extracts the id from a full profile URL", () => {
    expect(parseSteamId64("https://steamcommunity.com/profiles/76561197960287930/")).toBe(
      "76561197960287930",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(parseSteamId64("  76561197960287930  ")).toBe("76561197960287930");
  });

  it("rejects a vanity /id/ URL — no API key to resolve it", () => {
    expect(parseSteamId64("https://steamcommunity.com/id/near-wizard/")).toBeNull();
  });

  it("rejects a too-short number", () => {
    expect(parseSteamId64("123")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseSteamId64("")).toBeNull();
  });
});

describe("saveSteamId / loadSavedSteamId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a saved id", () => {
    saveSteamId("76561197960287930");
    expect(loadSavedSteamId()).toBe("76561197960287930");
  });

  it("returns null when nothing has been saved", () => {
    expect(loadSavedSteamId()).toBeNull();
  });
});
