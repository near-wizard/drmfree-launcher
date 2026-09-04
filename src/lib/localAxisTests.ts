import { invoke } from "@tauri-apps/api/core";
import type { AxisResult, AxisVote, DrmAxes } from "../types/drmAxes";
import { unknownAxes } from "../types/drmAxes";

const STORAGE_KEY = "drmfree-launcher:local-axis-tests";

// Results from this machine's own automation (structural lookups + the
// launch audit — see decisions 0025/0026 for exactly what is and isn't
// automatable). Local-only by default: one machine running a heuristic
// check thousands of times shouldn't be able to skew a pool meant to
// represent independent human judgment, and a bot check shouldn't be
// silently indistinguishable from a person's. Sharing a result is a
// conscious action — either the manual "Share this result" flow
// (shareableVotes below) or the explicit, off-by-default auto-submit
// preference (getAutoSubmitAuditResults below).
function gameKey(provider: string, id: string): string {
  return `${provider}:${id}`;
}

function readAll(): Record<string, DrmAxes> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, DrmAxes>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only — losing a locally-cached test result isn't
    // worth crashing over, the user can just rerun the test.
  }
}

export function getLocalAxisResults(provider: string, id: string): DrmAxes | null {
  return readAll()[gameKey(provider, id)] ?? null;
}

function mergeAxes(existing: DrmAxes | null, patch: Partial<DrmAxes>): DrmAxes {
  return { ...(existing ?? unknownAxes()), ...patch };
}

function saveLocalAxisResults(provider: string, id: string, patch: Partial<DrmAxes>): DrmAxes {
  const all = readAll();
  const key = gameKey(provider, id);
  const merged = mergeAxes(all[key] ?? null, patch);
  all[key] = merged;
  writeAll(all);
  return merged;
}

/** `no_storefront_client`/`no_launcher` are a deterministic fact of
 * which provider detected the game, not a live test — see
 * `structural_axes` in axis_test.rs. Cheap and safe to call for every
 * card unconditionally, no user action required. */
export async function runStructuralAxes(provider: string, id: string): Promise<DrmAxes> {
  const patch = await invoke<DrmAxes>("structural_axes", { provider });
  return saveLocalAxisResults(provider, id, patch);
}

export interface LaunchAuditResult {
  first_launch_offline: AxisResult;
  no_third_party_services: AxisResult;
}

/** The launch audit — spawns the exe once and reports two things from
 * that single launch: whether it stayed alive past `timeoutSecs`
 * instead of crashing (`first_launch_offline`), and whether it opened
 * any real outbound network connection while starting up
 * (`no_third_party_services`, via a read-only OS query, no elevation
 * needed). Only meaningful for a real local exe path (GOG/Humble);
 * never call this with a Steam/Epic protocol-launch id. See
 * axis_test.rs's doc comment for exactly what this does and doesn't
 * prove — it is a smoke test, not verification of actual offline play
 * or of what a game needs once past its first few seconds. */
export async function runLaunchAudit(
  provider: string,
  id: string,
  exePath: string,
  timeoutSecs = 8,
): Promise<LaunchAuditResult> {
  const result = await invoke<LaunchAuditResult>("run_launch_audit", { exePath, timeoutSecs });
  saveLocalAxisResults(provider, id, result);
  return result;
}

/** Runs every automatable check for a game in one action — this is
 * "the audit" the launcher's "Run audit" button triggers. The
 * structural lookup always runs; the launch audit only runs when a
 * real exe path is available, so a Steam/Epic game (no real exe path)
 * still gets whatever automation applies to it rather than nothing. */
export async function runFullAudit(provider: string, id: string, exePath: string | null): Promise<DrmAxes> {
  await runStructuralAxes(provider, id);
  if (exePath) {
    await runLaunchAudit(provider, id, exePath);
  }
  return getLocalAxisResults(provider, id) ?? unknownAxes();
}

const AUTO_SUBMIT_KEY = "drmfree-launcher:audit-auto-submit";

/** A standing, global preference (not per-game) for whether running an
 * audit should immediately submit its shareable results to the
 * community pool afterward, instead of waiting for an explicit manual
 * Share-then-Submit. Off by default — auto-submission is something a
 * user opts into, not a default this app picks for them (same "no
 * dark patterns" posture as decision 0025's local-only default). */
export function getAutoSubmitAuditResults(): boolean {
  try {
    return localStorage.getItem(AUTO_SUBMIT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAutoSubmitAuditResults(value: boolean): void {
  try {
    localStorage.setItem(AUTO_SUBMIT_KEY, value ? "true" : "false");
  } catch {
    // Best-effort only.
  }
}

/** Narrows a local result down to just the axes worth offering to
 * share — `unknown` axes carry nothing to vote on. Used to pre-fill
 * CommunityReport.tsx's own vote state; this never submits anything
 * itself, the human still has to click Submit there. */
export function shareableVotes(axes: DrmAxes): Partial<Record<keyof DrmAxes, AxisVote>> {
  const votes: Partial<Record<keyof DrmAxes, AxisVote>> = {};
  for (const [key, value] of Object.entries(axes) as [keyof DrmAxes, AxisResult][]) {
    if (value === "pass" || value === "fail") votes[key] = value;
  }
  return votes;
}
