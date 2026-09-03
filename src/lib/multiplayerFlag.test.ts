import { describe, it, expect, beforeEach } from "vitest";
import { getMultiplayerNeedsPlatform, setMultiplayerNeedsPlatform } from "./multiplayerFlag";

describe("multiplayerFlag", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false for a game that's never been flagged", () => {
    expect(getMultiplayerNeedsPlatform("steam", "1")).toBe(false);
  });

  it("persists a true flag", () => {
    setMultiplayerNeedsPlatform("steam", "1", true);
    expect(getMultiplayerNeedsPlatform("steam", "1")).toBe(true);
  });

  it("clears the flag when set back to false, not just stored as false", () => {
    setMultiplayerNeedsPlatform("steam", "1", true);
    setMultiplayerNeedsPlatform("steam", "1", false);
    expect(getMultiplayerNeedsPlatform("steam", "1")).toBe(false);
    expect(JSON.parse(localStorage.getItem("drmfree-launcher:multiplayer-needs-platform")!)).toEqual({});
  });

  it("keys by provider and id independently", () => {
    setMultiplayerNeedsPlatform("steam", "1", true);
    expect(getMultiplayerNeedsPlatform("epic", "1")).toBe(false);
    expect(getMultiplayerNeedsPlatform("steam", "2")).toBe(false);
  });
});
