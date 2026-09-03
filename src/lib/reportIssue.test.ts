import { describe, it, expect, beforeEach, vi } from "vitest";

const getVersionMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));

import { buildReportIssueUrl } from "./reportIssue";

describe("buildReportIssueUrl", () => {
  beforeEach(() => {
    getVersionMock.mockReset();
  });

  it("includes the app version and template in the query string", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    const url = await buildReportIssueUrl();
    expect(url).toContain("https://github.com/near-wizard/drmfree-launcher/issues/new?");
    expect(url).toContain("template=change_request.yml");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("context")).toContain("App version: 0.1.0");
  });

  it("falls back to 'unknown' when getVersion fails, instead of throwing", async () => {
    getVersionMock.mockRejectedValue(new Error("no tauri context"));
    const url = await buildReportIssueUrl();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("context")).toContain("App version: unknown");
  });

  it("guesses the platform from the user agent", async () => {
    getVersionMock.mockResolvedValue("0.1.0");
    vi.stubGlobal("navigator", { userAgent: "Windows NT 10.0" });
    const url = await buildReportIssueUrl();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("context")).toContain("OS: Windows");
    vi.unstubAllGlobals();
  });
});
