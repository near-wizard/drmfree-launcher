import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  loadOnboardingPlatforms,
  saveOnboardingPlatforms,
} from "./onboarding";

describe("onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has not been seen before anything is recorded", () => {
    expect(hasSeenOnboarding()).toBe(false);
  });

  it("is seen after being marked", () => {
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it("fails open (treated as seen) if localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(hasSeenOnboarding()).toBe(true);
    spy.mockRestore();
  });

  it("degrades to a no-op instead of throwing when marking fails", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => markOnboardingSeen()).not.toThrow();
    spy.mockRestore();
  });
});

describe("onboarding platform choices", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to an empty list", () => {
    expect(loadOnboardingPlatforms()).toEqual([]);
  });

  it("round-trips a saved selection", () => {
    saveOnboardingPlatforms(["gog", "epic"]);
    expect(loadOnboardingPlatforms()).toEqual(["gog", "epic"]);
  });
});
