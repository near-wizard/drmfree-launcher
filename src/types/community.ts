import type { DrmStatus } from "./game";
import type { AxisConsensusCounts } from "./drmAxes";

export interface CommunityNote {
  status: DrmStatus;
  note: string;
}

export interface CommunityConsensus {
  total: number;
  counts: Record<DrmStatus, number>;
  recentNotes: CommunityNote[];
  /** Absent from an older drmfree-community deployment that predates
   *  this field — callers should treat a missing key the same as
   *  all-zero counts, not a parse failure. */
  axes?: AxisConsensusCounts;
}
