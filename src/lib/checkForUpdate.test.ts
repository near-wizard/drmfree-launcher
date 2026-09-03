import { describe, it, expect, beforeEach, vi } from "vitest";

const getVersionMock = vi.hoisted(() => vi.fn());
const checkMock = vi.hoisted(() => vi.fn());
const relaunchMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));

import { checkForUpdate, installUpdate } from "./checkForUpdate";

describe("checkForUpdate", () => {
  beforeEach(() => {
    getVersionMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
  });

  it("returns null when nothing is newer", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    checkMock.mockResolvedValue(null);
    expect(await checkForUpdate()).toBeNull();
  });

  it("reports an available update with both versions", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    checkMock.mockResolvedValue({ version: "0.2.0" });
    const result = await checkForUpdate();
    expect(result).toEqual({
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      updateAvailable: true,
    });
  });

  it("swallows errors (offline, no endpoint) and returns null", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    checkMock.mockRejectedValue(new Error("offline"));
    expect(await checkForUpdate()).toBeNull();
  });
});

describe("installUpdate", () => {
  beforeEach(() => {
    getVersionMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
  });

  it("throws if called before a successful checkForUpdate", async () => {
    // Fresh module state isn't guaranteed across test files sharing the
    // same process, but within this describe block no prior check has
    // resolved to a truthy update, so pendingUpdate is still null.
    checkMock.mockResolvedValue(null);
    getVersionMock.mockResolvedValue("0.1.0");
    await checkForUpdate();
    await expect(installUpdate()).rejects.toThrow(/checkForUpdate/);
  });

  it("downloads, installs, and relaunches after a positive check", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "0.2.0", downloadAndInstall });
    await checkForUpdate();
    await installUpdate();
    expect(downloadAndInstall).toHaveBeenCalled();
    expect(relaunchMock).toHaveBeenCalled();
  });
});
