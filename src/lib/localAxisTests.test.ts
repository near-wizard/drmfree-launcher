import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getLocalAxisResults,
  runStructuralAxes,
  runLaunchAudit,
  runFullAudit,
  shareableVotes,
  getAutoSubmitAuditResults,
  setAutoSubmitAuditResults,
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

  it("persists both axes from a launch audit result", async () => {
    invokeMock.mockResolvedValue({ first_launch_offline: "pass", no_third_party_services: "fail" });
    const result = await runLaunchAudit("gog", "1", "C:\\Games\\X\\X.exe");
    expect(result).toEqual({ first_launch_offline: "pass", no_third_party_services: "fail" });
    const stored = getLocalAxisResults("gog", "1")!;
    expect(stored.first_launch_offline).toBe("pass");
    expect(stored.no_third_party_services).toBe("fail");
    expect(stored.no_launcher).toBe("unknown");
  });

  it("calls run_launch_audit with the exe path and a default timeout", async () => {
    invokeMock.mockResolvedValue({ first_launch_offline: "pass", no_third_party_services: "unknown" });
    await runLaunchAudit("humble", "2", "C:\\Games\\Y\\Y.exe");
    expect(invokeMock).toHaveBeenCalledWith("run_launch_audit", {
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

    invokeMock.mockResolvedValueOnce({ first_launch_offline: "fail", no_third_party_services: "pass" });
    await runLaunchAudit("gog", "1", "C:\\Games\\X\\X.exe");

    const stored = getLocalAxisResults("gog", "1")!;
    expect(stored.no_storefront_client).toBe("pass");
    expect(stored.first_launch_offline).toBe("fail");
    expect(stored.no_third_party_services).toBe("pass");
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

describe("runFullAudit", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("runs both structural and launch audits when a real exe path is given", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "structural_axes") {
        return Promise.resolve({ ...unknownAxes(), no_storefront_client: "pass", no_launcher: "pass" });
      }
      if (cmd === "run_launch_audit") {
        return Promise.resolve({ first_launch_offline: "pass", no_third_party_services: "pass" });
      }
      return Promise.resolve(null);
    });

    const result = await runFullAudit("gog", "1", "C:\\Games\\X\\X.exe");
    expect(result.no_launcher).toBe("pass");
    expect(result.first_launch_offline).toBe("pass");
    expect(result.no_third_party_services).toBe("pass");
    expect(invokeMock).toHaveBeenCalledWith("run_launch_audit", expect.anything());
  });

  it("skips the launch audit entirely when there is no real exe path", async () => {
    invokeMock.mockResolvedValue({ ...unknownAxes(), no_storefront_client: "fail", no_launcher: "fail" });
    const result = await runFullAudit("steam", "1", null);
    expect(result.no_launcher).toBe("fail");
    expect(invokeMock).not.toHaveBeenCalledWith("run_launch_audit", expect.anything());
  });
});

describe("auto-submit audit preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to off", () => {
    expect(getAutoSubmitAuditResults()).toBe(false);
  });

  it("persists once set", () => {
    setAutoSubmitAuditResults(true);
    expect(getAutoSubmitAuditResults()).toBe(true);
    setAutoSubmitAuditResults(false);
    expect(getAutoSubmitAuditResults()).toBe(false);
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
