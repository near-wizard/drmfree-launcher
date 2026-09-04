import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { clearCachedMatch, getCachedMatch } from "../lib/gogMatchCache";
import { checkGogMatch, type CheckResult } from "../lib/gogUpgradeCheck";
import { getCommunityConsensus, submitDrmReport } from "../lib/community";
import { applyCommunityConsensus } from "../lib/communityConsensus";
import { deriveAxisResults } from "../lib/drmAxesConsensus";
import {
  getAutoSubmitAuditResults,
  getLocalAxisResults,
  runFullAudit,
  runStructuralAxes,
  setAutoSubmitAuditResults,
  shareableVotes,
} from "../lib/localAxisTests";
import { track } from "../lib/analytics";
import { MANUAL_PROVIDER, removeManualGame } from "../lib/manualGames";
import { getMultiplayerNeedsPlatform, setMultiplayerNeedsPlatform } from "../lib/multiplayerFlag";
import { PawIcon } from "./PawIcon";
import { CommunityReport } from "./CommunityReport";
import { CompareDealModal } from "./CompareDealModal";
import type { DrmDeterminationMethod, DrmRecord, DrmStatus, Game } from "../types/game";
import type { CommunityConsensus } from "../types/community";
import { AXIS_CATEGORIES, AXIS_LABELS, type AxisResult, type AxisVotes, type DrmAxes } from "../types/drmAxes";

const DRM_LABELS: Record<DrmStatus, string> = {
  "drm-free": "DRM-Free",
  drm: "DRM",
  unknown: "DRM Unknown",
};

const DETERMINATION_LABELS: Record<DrmDeterminationMethod, string> = {
  storefront_import: "storefront policy",
  publisher_declared: "publisher declared",
  community_review: "community review",
  manual_review: "manual review",
};

// Surfaced as a tooltip, not the badge itself — decision 0008 exists
// because "DRM-Free" alone doesn't say whether that's a verified fact
// or a storefront-level default, so the provenance is one hover away
// rather than hidden entirely.
function drmTooltip(drm: DrmRecord): string {
  if (!drm.source || !drm.method) {
    return "No verified DRM source yet for this title (see decision 0008).";
  }
  const verified = drm.verified_on ? ` · verified ${drm.verified_on}` : "";
  return `Source: ${drm.source} (${DETERMINATION_LABELS[drm.method]})${verified}`;
}

// Deliberately not folded into a single value the way DrmStatus is —
// a category with mixed pass/fail axes is real, distinguishable
// information (decision 0024), collapsing it away would recreate the
// exact "too coarse" problem this feature exists to avoid.
type CategoryPip = AxisResult | "partial";

function categoryPipResult(axes: DrmAxes, categoryAxes: (keyof DrmAxes)[]): CategoryPip {
  const results = categoryAxes.map((axis) => axes[axis]);
  if (results.every((r) => r === "unknown")) return "unknown";
  if (results.every((r) => r === "pass" || r === "unknown")) {
    return results.some((r) => r === "pass") ? "pass" : "unknown";
  }
  if (results.every((r) => r === "fail" || r === "unknown")) return "fail";
  return "partial";
}

const CATEGORY_PIP_SYMBOL: Record<CategoryPip, string> = {
  pass: "✓",
  fail: "✕",
  partial: "~",
  unknown: "?",
};

// Most Steam app IDs map directly to this public CDN header image with
// no network round trip beyond the image itself — no API key needed,
// so this is tried first. It's a guess, not a guarantee: newer titles
// are served from a per-title hashed path this can't predict (real
// examples: "Mage Arena", "MECCHA CHAMELEON"), so the <img> tag's
// onError falls back to fetchSteamCoverArtFallback below rather than
// giving up straight to the placeholder.
function steamCoverArtUrl(game: Game): string | null {
  if (game.provider !== "steam") return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${game.id}/header.jpg`;
}

// Cached across cards/re-renders like gogCoverArtCache below — only
// hit for the subset of Steam titles the fast guess above misses.
const steamCoverArtFallbackCache = new Map<string, string | null>();

async function fetchSteamCoverArtFallback(id: string): Promise<string | null> {
  if (steamCoverArtFallbackCache.has(id)) return steamCoverArtFallbackCache.get(id) ?? null;
  const url = await invoke<string | null>("get_steam_cover_art", { id }).catch(() => null);
  steamCoverArtFallbackCache.set(id, url);
  return url;
}

// GOG has no equivalent deterministic-URL CDN, but the registry ID we
// already read for gog-provider games is the same ID GOG's public
// product API (api.gog.com/products/<id>) uses — an exact lookup, not
// a name-matching guess. That's a network round-trip rather than a
// plain <img src>, so results are cached across cards/re-renders
// (module-level, not component state — cards remount on list re-sort).
const gogCoverArtCache = new Map<string, string | null>();

async function fetchGogCoverArt(id: string): Promise<string | null> {
  if (gogCoverArtCache.has(id)) return gogCoverArtCache.get(id) ?? null;
  const url = await invoke<string | null>("get_gog_cover_art", { id }).catch(() => null);
  gogCoverArtCache.set(id, url);
  return url;
}

// Last-resort cover art for providers with no working lookup of their
// own (today: Epic, whose real catalog is behind an OAuth wall this
// app deliberately doesn't reverse-engineer credentials for — see
// decision 0023). Smaller and less polished than real cover art, but
// a real image beats the plain placeholder letter. Cached like the
// lookups above, keyed by the exe path rather than the game id since
// that's what the extraction actually reads.
const exeIconCache = new Map<string, string | null>();

async function fetchExeIcon(path: string): Promise<string | null> {
  if (exeIconCache.has(path)) return exeIconCache.get(path) ?? null;
  const url = await invoke<string | null>("get_exe_icon", { path }).catch(() => null);
  exeIconCache.set(path, url);
  return url;
}

// On-demand, not automatic — checking every installed game against
// GOG's catalog the moment the library loads would mean dozens of
// outbound requests on every launch for a large library. This is the
// first consumer of decision 0006's "buy DRM-free version" loop, kept
// deliberately opt-in per game (decision 0002's non-invasive spirit).
// Results persist in localStorage (gogMatchCache) so a check made in
// one session doesn't need repeating in the next.
type UpgradeCheckState = { status: "idle" } | { status: "checking" } | CheckResult;

function initialUpgradeState(game: Game): UpgradeCheckState {
  const cached = getCachedMatch(game.provider, game.id);
  if (!cached) return { status: "idle" };
  return cached.status === "found"
    ? { status: "found", storeUrl: cached.storeUrl!, price: cached.price ?? null }
    : { status: "not-found" };
}

function GogUpgradeCheck({
  game,
  providerLabel,
  onChecked,
}: {
  game: Game;
  providerLabel: string;
  onChecked?: () => void;
}) {
  const [state, setState] = useState<UpgradeCheckState>(() => initialUpgradeState(game));
  const [compareOpen, setCompareOpen] = useState(false);

  async function check() {
    setState({ status: "checking" });
    track("gog_check_clicked", { provider: game.provider });
    const result = await checkGogMatch(game);
    // A network/API failure isn't the same as a confirmed "no match" —
    // reset to idle so the next click retries instead of getting stuck
    // showing a false negative (checkGogMatch doesn't cache errors).
    setState(result.status === "error" ? { status: "idle" } : result);
    if (result.status !== "error") {
      track("gog_check_result", { found: result.status === "found" });
    }
    onChecked?.();
  }

  function recheck() {
    clearCachedMatch(game.provider, game.id);
    check();
  }

  switch (state.status) {
    case "idle":
      return (
        <button className="upgrade-check-button" onClick={check}>
          Check GOG
        </button>
      );
    case "checking":
      return (
        <span className="upgrade-check-status">
          <span className="spinner" aria-hidden="true" />
          Checking...
        </span>
      );
    case "found":
      return (
        <span className="upgrade-check-status">
          <button
            className="upgrade-found-button"
            onClick={() => {
              track("upgrade_buy_clicked", { provider: game.provider });
              openUrl(state.storeUrl);
            }}
          >
            <PawIcon />
            Buy DRM-free on GOG
          </button>
          <button className="upgrade-compare-button" onClick={() => setCompareOpen(true)}>
            Compare
          </button>
          <button className="upgrade-recheck-button" onClick={recheck} title="Check again">
            ↻
          </button>
          {compareOpen && (
            <CompareDealModal
              gameName={game.name}
              lockedProviderId={game.provider}
              lockedProviderLabel={providerLabel}
              lockedGameId={game.id}
              gogStoreUrl={state.storeUrl}
              gogPrice={state.price}
              onClose={() => setCompareOpen(false)}
            />
          )}
        </span>
      );
    case "not-found":
      return (
        <span className="upgrade-check-status">
          No GOG match found
          <button className="upgrade-recheck-button" onClick={recheck} title="Check again">
            ↻
          </button>
        </span>
      );
  }
}

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  launching: boolean;
  providerLabels: Record<string, string>;
  /** Bumped after a library-wide bulk check so GogUpgradeCheck remounts
   *  and re-reads gogMatchCache instead of staying on its stale "idle"
   *  state from before the bulk check ran. */
  cacheVersion?: number;
  /** Called after this card's own "Check GOG"/recheck resolves, so the
   *  library-wide match-count summary updates without waiting for a
   *  bulk check. */
  onMatchChecked?: () => void;
  /** Only relevant for manually-added games (see lib/manualGames.ts) —
   *  omitted entirely for every other provider's cards. */
  onRemoveManual?: (id: string) => void;
}

export function GameCard({
  game,
  onLaunch,
  launching,
  providerLabels,
  cacheVersion,
  onMatchChecked,
  onRemoveManual,
}: GameCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [gogCoverUrl, setGogCoverUrl] = useState<string | null>(null);
  const [exeIconUrl, setExeIconUrl] = useState<string | null>(null);
  const [steamFallbackUrl, setSteamFallbackUrl] = useState<string | null>(null);
  const [steamFallbackTried, setSteamFallbackTried] = useState(false);
  const [consensus, setConsensus] = useState<CommunityConsensus | null>(null);
  const [consensusLoaded, setConsensusLoaded] = useState(false);
  const [mpNeedsPlatform, setMpNeedsPlatform] = useState(() =>
    getMultiplayerNeedsPlatform(game.provider, game.id),
  );
  const [axesExpanded, setAxesExpanded] = useState(false);
  const [localAxes, setLocalAxes] = useState<DrmAxes | null>(() => getLocalAxisResults(game.provider, game.id));
  const [auditRunning, setAuditRunning] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(() => getAutoSubmitAuditResults());
  const [shareSignal, setShareSignal] = useState<{ votes: AxisVotes; key: number } | null>(null);

  useEffect(() => {
    if (game.provider !== "gog") return;
    let cancelled = false;
    fetchGogCoverArt(game.id).then((url) => {
      if (!cancelled) setGogCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  // Fetched once here (not inside CommunityReport) since the badge
  // below also needs it — a game with no local DRM determination at
  // all falls back to what the community has agreed on, closing the
  // gap decisions 0008/0014 left open (see communityConsensus.ts).
  // Skipped for manual entries: their id is a random per-install UUID,
  // never shared across users, so a lookup could never match anything
  // — a wasted round trip for a game that's already asserted DRM-free.
  useEffect(() => {
    if (game.provider === MANUAL_PROVIDER) return;
    let cancelled = false;
    getCommunityConsensus(game.provider, game.id).then((c) => {
      if (cancelled) return;
      setConsensus(c);
      setConsensusLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  useEffect(() => {
    if (!game.icon_source) return;
    let cancelled = false;
    fetchExeIcon(game.icon_source).then((url) => {
      if (!cancelled) setExeIconUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [game.icon_source]);

  // Structural axes are a free lookup, not a live test (decision 0025)
  // — safe to run for every card unconditionally, no button needed.
  // Skipped for manual entries, same reasoning as the consensus fetch
  // above: their id/provider carries no provider-level guarantee
  // either way, structural_axes would just return Unknown for them.
  useEffect(() => {
    if (game.provider === MANUAL_PROVIDER) return;
    let cancelled = false;
    runStructuralAxes(game.provider, game.id).then((axes) => {
      if (!cancelled) setLocalAxes(axes);
    });
    return () => {
      cancelled = true;
    };
  }, [game.provider, game.id]);

  // The launch half of the audit is real automation (it actually
  // spawns the exe) — explicit, user-triggered only, never run on
  // mount. Only offered where game.exe_path is a real filesystem path
  // (GOG/Humble); Steam/Epic's exe_path is a protocol-launch id, not
  // something std::process::Command can spawn — see
  // localAxisTests.ts's doc comment.
  const canRunLaunchAudit = (game.provider === "gog" || game.provider === "humble") && !!game.exe_path;

  async function runAudit() {
    setAuditRunning(true);
    try {
      const axes = await runFullAudit(game.provider, game.id, game.exe_path);
      setLocalAxes(axes);
      track("local_axis_audit_run", { provider: game.provider, ranLaunchAudit: canRunLaunchAudit });
      if (autoSubmit) {
        await submitAuditResult(axes);
      }
    } finally {
      setAuditRunning(false);
    }
  }

  function toggleAutoSubmit() {
    setAutoSubmit((prev) => {
      const next = !prev;
      setAutoSubmitAuditResults(next);
      return next;
    });
  }

  async function submitAuditResult(axes: DrmAxes) {
    const votes = shareableVotes(axes);
    if (Object.keys(votes).length === 0) return;
    const ok = await submitDrmReport(game.provider, game.id, game.name, effectiveDrm.status, undefined, votes);
    if (ok) {
      track("community_report_submitted", { status: effectiveDrm.status, axesTested: Object.keys(votes).length, source: "auto_submit" });
      const updated = await getCommunityConsensus(game.provider, game.id);
      if (updated) setConsensus(updated);
    }
  }

  function shareLocalResult() {
    if (!localAxes) return;
    setShareSignal((prev) => ({ votes: shareableVotes(localAxes), key: (prev?.key ?? 0) + 1 }));
  }

  const coverUrl = steamFallbackUrl ?? steamCoverArtUrl(game) ?? gogCoverUrl ?? exeIconUrl;
  const effectiveDrm = applyCommunityConsensus(game.drm, consensus);
  const effectiveAxes = deriveAxisResults(consensus);
  const hasAnyAxisData = Object.values(effectiveAxes).some((r) => r !== "unknown");

  // The fast-guess Steam URL failing isn't necessarily "no image" —
  // try the real lookup once before falling back to the placeholder.
  // GOG/no-cover cases have nothing further to try, so they go
  // straight to imageFailed as before.
  function onCoverError() {
    if (game.provider === "steam" && !steamFallbackTried) {
      setSteamFallbackTried(true);
      fetchSteamCoverArtFallback(game.id).then((url) => {
        if (url) setSteamFallbackUrl(url);
        else setImageFailed(true);
      });
      return;
    }
    setImageFailed(true);
  }

  return (
    <div className="game-card">
      <div className="game-card-info">
        {coverUrl && !imageFailed ? (
          <img
            className="game-thumb"
            src={coverUrl}
            alt=""
            loading="lazy"
            onError={onCoverError}
          />
        ) : (
          <span className="game-thumb game-thumb-placeholder" aria-hidden="true">
            {game.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`origin-badge origin-${game.provider}`}>
          {providerLabels[game.provider] ?? game.provider}
        </span>
        <span className={`drm-badge drm-${effectiveDrm.status}`} title={drmTooltip(effectiveDrm)}>
          {DRM_LABELS[effectiveDrm.status]}
        </span>
        {mpNeedsPlatform && (
          <span
            className="mp-platform-badge"
            title={`Marked by you: multiplayer still needs ${providerLabels[game.provider] ?? game.provider}, even though the base install is DRM-free.`}
          >
            MP needs {providerLabels[game.provider] ?? game.provider}
          </span>
        )}
        <span className="game-name">{game.name}</span>
        {hasAnyAxisData && (
          <div className="axis-pips-row">
            <button
              type="button"
              className="axis-pips-toggle"
              onClick={() => setAxesExpanded((e) => !e)}
              aria-expanded={axesExpanded}
              title="Community-reported freedom test results"
            >
              {AXIS_CATEGORIES.map((category) => {
                const pip = categoryPipResult(effectiveAxes, category.axes);
                return (
                  <span
                    key={category.label}
                    className={`axis-pip axis-pip-${pip}`}
                    title={category.label}
                  >
                    {CATEGORY_PIP_SYMBOL[pip]}
                  </span>
                );
              })}
            </button>
            {axesExpanded && (
              <ul className="axis-pips-detail">
                {AXIS_CATEGORIES.flatMap((category) => category.axes).map((axis) => (
                  <li key={axis} className={`axis-pip-detail-row axis-pip-${effectiveAxes[axis]}`}>
                    <span>{CATEGORY_PIP_SYMBOL[effectiveAxes[axis]]}</span> {AXIS_LABELS[axis]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {localAxes && Object.values(localAxes).some((r) => r !== "unknown") && (
          <div className="local-axis-pips-row">
            <span
              className="local-axis-pips-toggle"
              title={
                autoSubmit
                  ? "Results from this machine's own automated checks — auto-submit is on, so these are shared after each audit run"
                  : "Results from this machine's own automated checks — local only until you share them (see decision 0026)"
              }
            >
              <span className="local-axis-pips-label">your machine:</span>
              {AXIS_CATEGORIES.map((category) => {
                const pip = categoryPipResult(localAxes, category.axes);
                return (
                  <span key={category.label} className={`axis-pip axis-pip-${pip}`} title={category.label}>
                    {CATEGORY_PIP_SYMBOL[pip]}
                  </span>
                );
              })}
            </span>
            {!autoSubmit && consensusLoaded && consensus !== null && (
              <button type="button" className="local-axis-share-button" onClick={shareLocalResult}>
                Share this result
              </button>
            )}
          </div>
        )}
        {canRunLaunchAudit && (
          <div className="local-audit-row">
            <button
              type="button"
              className="local-axis-test-button"
              onClick={runAudit}
              disabled={auditRunning}
              title="Runs every automatable freedom-test check for this game, including briefly launching it — a smoke test, not proof of offline play (see decision 0026)"
            >
              {auditRunning ? "Running audit…" : "Run audit"}
            </button>
            <label
              className="local-audit-auto-submit"
              title="Share results with the community automatically after each audit, instead of a separate Share step"
            >
              <input type="checkbox" checked={autoSubmit} onChange={toggleAutoSubmit} />
              Auto-submit results
            </label>
          </div>
        )}
      </div>
      <div className="game-card-actions">
        {consensusLoaded && consensus !== null && (
          <CommunityReport
            game={game}
            consensus={consensus}
            onReported={setConsensus}
            prefillAxisVotes={shareSignal?.votes}
            shareKey={shareSignal?.key}
          />
        )}
        {game.provider !== "gog" && game.provider !== MANUAL_PROVIDER && (
          <GogUpgradeCheck
            key={cacheVersion}
            game={game}
            providerLabel={providerLabels[game.provider] ?? game.provider}
            onChecked={onMatchChecked}
          />
        )}
        {effectiveDrm.status === "drm-free" && (
          <button
            className="open-folder-button"
            title={
              mpNeedsPlatform
                ? "Un-mark: multiplayer doesn't actually need the platform"
                : "Mark: multiplayer still needs the platform, even though the base install is DRM-free"
            }
            aria-label={mpNeedsPlatform ? "Un-mark multiplayer platform requirement" : "Mark multiplayer platform requirement"}
            onClick={() => {
              const next = !mpNeedsPlatform;
              setMultiplayerNeedsPlatform(game.provider, game.id, next);
              setMpNeedsPlatform(next);
              track("multiplayer_flag_toggled", { provider: game.provider, value: next });
            }}
          >
            🌐
          </button>
        )}
        {game.install_dir && (
          <button
            className="open-folder-button"
            title="Open install folder"
            aria-label="Open install folder"
            onClick={() => {
              track("open_install_folder_clicked", { provider: game.provider });
              const openFolder =
                game.provider === MANUAL_PROVIDER
                  ? revealItemInDir(game.install_dir!)
                  : invoke("open_install_folder", { provider: game.provider, id: game.id });
              openFolder.catch((e) => console.error("failed to open install folder:", e));
            }}
          >
            📂
          </button>
        )}
        {game.provider === MANUAL_PROVIDER && onRemoveManual && (
          <button
            className="open-folder-button"
            title="Remove this manual entry"
            aria-label="Remove this manual entry"
            onClick={() => {
              removeManualGame(game.id);
              onRemoveManual(game.id);
            }}
          >
            🗑
          </button>
        )}
        <button
          className="play-button"
          disabled={launching || (game.provider === MANUAL_PROVIDER && !game.exe_path)}
          title={game.provider === MANUAL_PROVIDER && !game.exe_path ? "No executable set for this entry" : undefined}
          onClick={() => onLaunch(game)}
        >
          {!launching && <PawIcon />}
          {launching ? "Launching..." : "Play"}
        </button>
      </div>
    </div>
  );
}
