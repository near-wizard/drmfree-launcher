import { describe, it, expect, beforeEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getClientId, getCommunityConsensus, submitDrmReport } from "./community";

describe("getClientId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates and persists an id on first call", () => {
    const id = getClientId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem("drmfree-launcher:community-client-id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getClientId();
    const second = getClientId();
    expect(second).toBe(first);
  });
});

describe("getCommunityConsensus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns the consensus on a successful call", async () => {
    invokeMock.mockResolvedValue({ total: 2, counts: { "drm-free": 2, drm: 0, unknown: 0 }, recentNotes: [] });
    const result = await getCommunityConsensus("steam", "1");
    expect(result?.total).toBe(2);
  });

  it("returns null when the backend isn't configured (resolves null)", async () => {
    invokeMock.mockResolvedValue(null);
    const result = await getCommunityConsensus("steam", "1");
    expect(result).toBeNull();
  });

  it("retries once on failure before giving up", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network blip"));
    invokeMock.mockResolvedValueOnce({ total: 1, counts: { "drm-free": 1, drm: 0, unknown: 0 }, recentNotes: [] });
    const result = await getCommunityConsensus("steam", "1");
    expect(result?.total).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("returns null (not a throw) if both attempts fail", async () => {
    invokeMock.mockRejectedValue(new Error("still down"));
    const result = await getCommunityConsensus("steam", "1");
    expect(result).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

describe("submitDrmReport", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("returns true on success", async () => {
    invokeMock.mockResolvedValue(undefined);
    const ok = await submitDrmReport("steam", "1", "Risk of Rain", "drm-free");
    expect(ok).toBe(true);
  });

  it("returns false instead of throwing on failure", async () => {
    invokeMock.mockRejectedValue(new Error("rejected"));
    const ok = await submitDrmReport("steam", "1", "Risk of Rain", "drm-free");
    expect(ok).toBe(false);
  });

  it("sends null (not undefined) for an omitted note", async () => {
    invokeMock.mockResolvedValue(undefined);
    await submitDrmReport("steam", "1", "Risk of Rain", "drm-free");
    expect(invokeMock).toHaveBeenCalledWith(
      "submit_drm_report",
      expect.objectContaining({ note: null }),
    );
  });
});
