import type { CommunityConsensus } from "../types/community";
import type { AxisCounts, AxisResult, DrmAxes } from "../types/drmAxes";
import { unknownAxes } from "../types/drmAxes";
import { MIN_MAJORITY_RATIO, MIN_REPORTS } from "./communityConsensus";

// Same per-field threshold as communityConsensus.ts's status vote,
// applied independently per axis — an axis with only one vote stays
// "unknown" even if nine other axes on the same title have a strong
// consensus; each of the eleven tests is its own falsifiable claim,
// not a shared pool of trust.
function deriveAxisResult(counts: AxisCounts | undefined): AxisResult {
  if (!counts || counts.total < MIN_REPORTS) return "unknown";
  const passRatio = counts.pass / counts.total;
  const failRatio = counts.fail / counts.total;
  if (passRatio >= MIN_MAJORITY_RATIO) return "pass";
  if (failRatio >= MIN_MAJORITY_RATIO) return "fail";
  return "unknown";
}

/** Folds a community consensus into a full set of per-axis results —
 * every axis without enough signal yet stays "unknown", same
 * conservative default as `DrmAxes.unknown()`/`unknownAxes()`. */
export function deriveAxisResults(consensus: CommunityConsensus | null): DrmAxes {
  const axes = unknownAxes();
  if (!consensus?.axes) return axes;

  for (const key of Object.keys(axes) as (keyof DrmAxes)[]) {
    axes[key] = deriveAxisResult(consensus.axes[key]);
  }
  return axes;
}
