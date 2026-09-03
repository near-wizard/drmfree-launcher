import { useEffect, useState } from "react";
import { getCommunityConsensus, submitDrmReport } from "../lib/community";
import { track } from "../lib/analytics";
import type { DrmStatus, Game } from "../types/game";
import type { CommunityConsensus } from "../types/community";

const STATUS_LABELS: Record<DrmStatus, string> = {
  "drm-free": "DRM-Free",
  drm: "DRM",
  unknown: "Unknown",
};

function consensusTooltip(consensus: CommunityConsensus): string {
  const parts = (Object.keys(STATUS_LABELS) as DrmStatus[])
    .filter((s) => consensus.counts[s] > 0)
    .map((s) => `${consensus.counts[s]} ${STATUS_LABELS[s]}`);
  return `Community reports: ${parts.join(", ")}`;
}

// Renders nothing when no community backend is configured for this
// build (see community.rs) — this is a deliberate "don't show a
// feature that doesn't work" choice, not a loading bug.
export function CommunityReport({ game }: { game: Game }) {
  const [consensus, setConsensus] = useState<CommunityConsensus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reportStatus, setReportStatus] = useState<DrmStatus>("drm-free");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCommunityConsensus(game.provider, game.id).then((c) => {
      if (cancelled) return;
      setConsensus(c);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  if (!loaded || consensus === null) return null;

  async function submit() {
    setSubmitting(true);
    const ok = await submitDrmReport(game.provider, game.id, game.name, reportStatus);
    setSubmitting(false);
    if (ok) {
      setJustSubmitted(true);
      track("community_report_submitted", { status: reportStatus });
      const updated = await getCommunityConsensus(game.provider, game.id);
      setConsensus(updated);
    }
  }

  return (
    <span className="community-report">
      {consensus.total > 0 && (
        <span className="community-count" title={consensusTooltip(consensus)}>
          🤝 {consensus.total}
        </span>
      )}
      <select
        className="community-status-select"
        value={reportStatus}
        onChange={(e) => setReportStatus(e.currentTarget.value as DrmStatus)}
        aria-label={`Report DRM status for ${game.name}`}
      >
        <option value="drm-free">DRM-Free</option>
        <option value="drm">DRM</option>
        <option value="unknown">Unknown</option>
      </select>
      <button
        className="community-report-button"
        onClick={submit}
        disabled={submitting}
        title="Confirm or correct this game's DRM status from your own experience"
      >
        {justSubmitted ? "✓" : "Report"}
      </button>
    </span>
  );
}
