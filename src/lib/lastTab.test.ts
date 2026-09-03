import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadLastTab, saveLastTab } from "./lastTab";

describe("lastTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to library when nothing was ever saved", () => {
    expect(loadLastTab()).toBe("library");
  });

  it("persists and reloads the store tab", () => {
    saveLastTab("store");
    expect(loadLastTab()).toBe("store");
  });

  it("persists and reloads the wishlist tab", () => {
    saveLastTab("wishlist");
    expect(loadLastTab()).toBe("wishlist");
  });

  it("falls back to library for any unrecognized stored value", () => {
    localStorage.setItem("drmfree-launcher:last-tab", "garbage");
    expect(loadLastTab()).toBe("library");
  });

  it("degrades to a no-op instead of throwing when localStorage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => saveLastTab("store")).not.toThrow();
    spy.mockRestore();
  });
});
