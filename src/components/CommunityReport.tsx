import { useState } from "react";
import { getCommunityConsensus, submitDrmReport } from "../lib/community";
import { track } from "../lib/analytics";
import type { DrmStatus, Game } from "../types/game";
import type { CommunityConsensus } from "../types/community";
import { AXIS_CATEGORIES, AXIS_LABELS, type AxisVote, type AxisVotes, type DrmAxes } from "../types/drmAxes";

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

interface CommunityReportProps {
  game: Game;
  /** Fetched once by the parent (GameCard also needs it to fold into
   *  the DRM badge — see communityConsensus.ts), not by this
   *  component, so a card only ever makes one consensus request. */
  consensus: CommunityConsensus;
  /** Called with the fresh consensus after a successful submission, so
   *  the parent's badge-derivation picks up the new report too. */
  onReported: (consensus: CommunityConsensus) => void;
}

// The parent only renders this once a non-null consensus has loaded —
// see GameCard, which is also what makes "no community backend
// configured for this build" a silent no-op rather than a loading bug
// here.
export function CommunityReport({ game, consensus, onReported }: CommunityReportProps) {
  const [reportStatus, setReportStatus] = useState<DrmStatus>("drm-free");
  const [axisVotes, setAxisVotes] = useState<AxisVotes>({});
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  function setAxisVote(axis: keyof DrmAxes, vote: AxisVote | undefined) {
    setAxisVotes((prev) => {
      const next = { ...prev };
      if (vote === undefined) delete next[axis];
      else next[axis] = vote;
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    const ok = await submitDrmReport(game.provider, game.id, game.name, reportStatus, undefined, axisVotes);
    setSubmitting(false);
    if (ok) {
      setJustSubmitted(true);
      track("community_report_submitted", { status: reportStatus, axesTested: Object.keys(axisVotes).length });
      const updated = await getCommunityConsensus(game.provider, game.id);
      if (updated) onReported(updated);
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
      <details className="freedom-test-report">
        <summary>Report a freedom test</summary>
        {AXIS_CATEGORIES.map((category) => (
          <fieldset key={category.label} className="freedom-test-category">
            <legend>{category.label}</legend>
            {category.axes.map((axis) => (
              <div key={axis} className="freedom-test-row">
                <span className="freedom-test-label">{AXIS_LABELS[axis]}</span>
                <div className="freedom-test-controls" role="group" aria-label={AXIS_LABELS[axis]}>
                  <button
                    type="button"
                    className={axisVotes[axis] === "pass" ? "freedom-test-vote freedom-test-vote-active" : "freedom-test-vote"}
                    onClick={() => setAxisVote(axis, axisVotes[axis] === "pass" ? undefined : "pass")}
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    className={axisVotes[axis] === "fail" ? "freedom-test-vote freedom-test-vote-active" : "freedom-test-vote"}
                    onClick={() => setAxisVote(axis, axisVotes[axis] === "fail" ? undefined : "fail")}
                  >
                    Fail
                  </button>
                </div>
              </div>
            ))}
          </fieldset>
        ))}
        <button
          type="button"
          className="community-report-button freedom-test-submit"
          onClick={submit}
          disabled={submitting || Object.keys(axisVotes).length === 0}
        >
          {justSubmitted ? "✓ Submitted" : "Submit freedom test results"}
        </button>
      </details>
    </span>
  );
}
