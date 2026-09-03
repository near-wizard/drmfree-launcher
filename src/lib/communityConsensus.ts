import type { DrmRecord, DrmStatus } from "../types/game";
import type { CommunityConsensus } from "../types/community";

// Decision 0008 defined `DrmDeterminationMethod::community_review` as
// a placeholder for exactly this — a badge status derived from
// community reports, not just GOG's whole-storefront policy — but
// nothing ever constructed one; the reports only ever showed up as a
// side counter (CommunityReport.tsx), never fed back into the badge
// itself. This closes that gap.
//
// Deliberately conservative: only promotes a genuinely "unknown"
// local record (never overrides a storefront-verified or
// publisher-declared one), and only once there's an actual majority,
// not a single opinionated report.
const MIN_REPORTS = 3;
const MIN_MAJORITY_RATIO = 0.6;

/** Returns the community-agreed DRM status, or null if there isn't
 * (yet) enough signal to call it a consensus. */
export function deriveCommunityDrmStatus(consensus: CommunityConsensus | null): DrmStatus | null {
  if (!consensus || consensus.total < MIN_REPORTS) return null;

  const entries = Object.entries(consensus.counts) as [DrmStatus, number][];
  const [topStatus, topCount] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  if (topCount / consensus.total < MIN_MAJORITY_RATIO) return null;

  return topStatus;
}

/** Folds a community consensus into a game's DRM record for display.
 * Local determinations (GOG's own policy, a publisher's statement, a
 * prior manual/community review) always win — this only fills in when
 * `drm.method` is null, i.e. there's no determination at all yet. */
export function applyCommunityConsensus(
  drm: DrmRecord,
  consensus: CommunityConsensus | null,
): DrmRecord {
  if (drm.method !== null) return drm;

  const derived = deriveCommunityDrmStatus(consensus);
  if (!derived) return drm;

  return {
    status: derived,
    source: `${consensus!.total} community reports`,
    method: "community_review",
    verified_on: null,
  };
}
