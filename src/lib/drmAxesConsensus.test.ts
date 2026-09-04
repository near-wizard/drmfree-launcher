import { describe, it, expect } from "vitest";
import { deriveAxisResults } from "./drmAxesConsensus";
import { unknownAxes } from "../types/drmAxes";
import type { AxisConsensusCounts, AxisCounts } from "../types/drmAxes";
import type { CommunityConsensus } from "../types/community";

function counts(pass: number, fail: number): AxisCounts {
  return { pass, fail, total: pass + fail };
}

function consensusWithAxes(overrides: Partial<AxisConsensusCounts>): CommunityConsensus {
  const zero = counts(0, 0);
  const full: AxisConsensusCounts = {
    first_launch_offline: zero,
    continued_offline_play: zero,
    no_publisher_account: zero,
    no_storefront_account: zero,
    no_storefront_client: zero,
    no_launcher: zero,
    copyable_install: zero,
    reinstallable_from_offline_media: zero,
    no_publisher_auth_servers: zero,
    no_third_party_services: zero,
    no_server_dependent_core_features: zero,
    ...overrides,
  };
  return { total: 0, counts: { "drm-free": 0, drm: 0, unknown: 0 }, recentNotes: [], axes: full };
}

describe("deriveAxisResults", () => {
  it("returns all-unknown with no consensus", () => {
    expect(deriveAxisResults(null)).toEqual(unknownAxes());
  });

  it("returns all-unknown when the consensus predates the axes field", () => {
    const c: CommunityConsensus = { total: 5, counts: { "drm-free": 5, drm: 0, unknown: 0 }, recentNotes: [] };
    expect(deriveAxisResults(c)).toEqual(unknownAxes());
  });

  it("leaves an axis unknown below the minimum report threshold", () => {
    const c = consensusWithAxes({ first_launch_offline: counts(2, 0) });
    expect(deriveAxisResults(c).first_launch_offline).toBe("unknown");
  });

  it("passes an axis once enough reports agree", () => {
    const c = consensusWithAxes({ first_launch_offline: counts(3, 0) });
    expect(deriveAxisResults(c).first_launch_offline).toBe("pass");
  });

  it("fails an axis once enough reports agree it fails", () => {
    const c = consensusWithAxes({ no_launcher: counts(0, 3) });
    expect(deriveAxisResults(c).no_launcher).toBe("fail");
  });

  it("leaves an axis unknown when split without a clear majority", () => {
    const c = consensusWithAxes({ copyable_install: counts(2, 2) });
    expect(deriveAxisResults(c).copyable_install).toBe("unknown");
  });

  it("resolves each axis independently, not off a shared pool of trust", () => {
    const c = consensusWithAxes({
      first_launch_offline: counts(5, 0),
      no_storefront_client: counts(1, 0),
    });
    const result = deriveAxisResults(c);
    expect(result.first_launch_offline).toBe("pass");
    expect(result.no_storefront_client).toBe("unknown");
  });
});
