import { describe, it, expect } from "vitest";
import { deriveCommunityDrmStatus, applyCommunityConsensus } from "./communityConsensus";
import type { DrmRecord } from "../types/game";
import type { CommunityConsensus } from "../types/community";

function consensus(counts: Partial<Record<"drm-free" | "drm" | "unknown", number>>): CommunityConsensus {
  const full = { "drm-free": 0, drm: 0, unknown: 0, ...counts };
  const total = full["drm-free"] + full.drm + full.unknown;
  return { total, counts: full, recentNotes: [] };
}

const unknownRecord: DrmRecord = { status: "unknown", source: null, method: null, verified_on: null };
const gogRecord: DrmRecord = {
  status: "drm-free",
  source: "GOG",
  method: "storefront_import",
  verified_on: "2026-01-01",
};

describe("deriveCommunityDrmStatus", () => {
  it("returns null with no consensus", () => {
    expect(deriveCommunityDrmStatus(null)).toBeNull();
  });

  it("returns null below the minimum report threshold", () => {
    expect(deriveCommunityDrmStatus(consensus({ "drm-free": 2 }))).toBeNull();
  });

  it("returns null when reports are split without a clear majority", () => {
    expect(deriveCommunityDrmStatus(consensus({ "drm-free": 2, drm: 2 }))).toBeNull();
  });

  it("returns the majority status once enough reports agree", () => {
    expect(deriveCommunityDrmStatus(consensus({ "drm-free": 3 }))).toBe("drm-free");
  });

  it("returns the majority status at exactly the ratio threshold", () => {
    // 3 of 5 = 0.6, right at MIN_MAJORITY_RATIO.
    expect(deriveCommunityDrmStatus(consensus({ drm: 3, "drm-free": 2 }))).toBe("drm");
  });

  it("returns null just under the majority ratio", () => {
    // 3 of 6 = 0.5, below the 0.6 threshold, even though the report
    // count minimum is met.
    expect(deriveCommunityDrmStatus(consensus({ drm: 3, "drm-free": 3 }))).toBeNull();
  });
});

describe("applyCommunityConsensus", () => {
  it("leaves a record with an existing determination untouched", () => {
    const c = consensus({ drm: 10 });
    expect(applyCommunityConsensus(gogRecord, c)).toBe(gogRecord);
  });

  it("leaves an unknown record untouched when there's no consensus yet", () => {
    expect(applyCommunityConsensus(unknownRecord, null)).toBe(unknownRecord);
  });

  it("leaves an unknown record untouched when consensus is inconclusive", () => {
    const c = consensus({ drm: 2, "drm-free": 2 });
    expect(applyCommunityConsensus(unknownRecord, c)).toBe(unknownRecord);
  });

  it("promotes an unknown record to the community-derived status", () => {
    const c = consensus({ "drm-free": 4 });
    const result = applyCommunityConsensus(unknownRecord, c);
    expect(result).toEqual({
      status: "drm-free",
      source: "4 community reports",
      method: "community_review",
      verified_on: null,
    });
  });
});
