import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getLocalAxisResults,
  runStructuralAxes,
  runLaunchSmokeTest,
  shareableVotes,
} from "./localAxisTests";
import { unknownAxes } from "../types/drmAxes";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("localAxisTests", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("returns null for a game with no local test history", () => {
    expect(getLocalAxisResults("gog", "1")).toBeNull();
  });

  it("persists structural axes results and returns them from getLocalAxisResults", async () => {
    invokeMock.mockResolvedValue({
      ...unknownAxes(),
      no_storefront_client: "pass",
      no_launcher: "pass",
    });
    const result = await runStructuralAxes("gog", "1");
    expect(result.no_storefront_client).toBe("pass");
    expect(getLocalAxisResults("gog", "1")).toEqual(result);
  });

  it("calls structural_axes with the given provider", async () => {
    invokeMock.mockResolvedValue(unknownAxes());
    await runStructuralAxes("steam", "42");
    expect(invokeMock).toHaveBeenCalledWith("structural_axes", { provider: "steam" });
  });

  it("persists a launch smoke test result under first_launch_offline only", async () => {
    invokeMock.mockResolvedValue("pass");
    const result = await runLaunchSmokeTest("gog", "1", "C:\\Games\\X\\X.exe");
    expect(result).toBe("pass");
    const stored = getLocalAxisResults("gog", "1")!;
    expect(stored.first_launch_offline).toBe("pass");
    expect(stored.no_launcher).toBe("unknown");
  });

  it("calls run_launch_smoke_test with the exe path and a default timeout", async () => {
    invokeMock.mockResolvedValue("fail");
    await runLaunchSmokeTest("humble", "2", "C:\\Games\\Y\\Y.exe");
    expect(invokeMock).toHaveBeenCalledWith("run_launch_smoke_test", {
      exePath: "C:\\Games\\Y\\Y.exe",
      timeoutSecs: 8,
    });
  });

  it("merges results across separate calls for the same game rather than overwriting", async () => {
    invokeMock.mockResolvedValueOnce({
      ...unknownAxes(),
      no_storefront_client: "pass",
      no_launcher: "pass",
    });
    await runStructuralAxes("gog", "1");

    invokeMock.mockResolvedValueOnce("fail");
    await runLaunchSmokeTest("gog", "1", "C:\\Games\\X\\X.exe");

    const stored = getLocalAxisResults("gog", "1")!;
    expect(stored.no_storefront_client).toBe("pass");
    expect(stored.first_launch_offline).toBe("fail");
  });

  it("keeps separate games' results independent", async () => {
    invokeMock.mockResolvedValueOnce({ ...unknownAxes(), no_launcher: "pass" });
    await runStructuralAxes("gog", "1");
    invokeMock.mockResolvedValueOnce({ ...unknownAxes(), no_launcher: "fail" });
    await runStructuralAxes("steam", "1");

    expect(getLocalAxisResults("gog", "1")!.no_launcher).toBe("pass");
    expect(getLocalAxisResults("steam", "1")!.no_launcher).toBe("fail");
  });
});

describe("shareableVotes", () => {
  it("includes only pass/fail axes, dropping unknown ones", () => {
    const axes = { ...unknownAxes(), first_launch_offline: "pass" as const, no_launcher: "fail" as const };
    expect(shareableVotes(axes)).toEqual({
      first_launch_offline: "pass",
      no_launcher: "fail",
    });
  });

  it("returns an empty object when nothing has been tested", () => {
    expect(shareableVotes(unknownAxes())).toEqual({});
  });
});
