import { invoke } from "@tauri-apps/api/core";
import type { AxisResult, AxisVote, DrmAxes } from "../types/drmAxes";
import { unknownAxes } from "../types/drmAxes";

const STORAGE_KEY = "drmfree-launcher:local-axis-tests";

// Local-only results from this machine's own automation (structural
// lookups + the launch smoke test — see decision 0025 for exactly
// what is and isn't automatable). Deliberately never auto-submitted
// to the shared drmfree-community consensus pool: one machine running
// a heuristic check thousands of times shouldn't be able to skew a
// pool meant to represent independent human judgment, and a bot check
// shouldn't be silently indistinguishable from a person's. Sharing a
// result stays a conscious, separate action — see shareToVotes below.
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

/** The `first_launch_offline` smoke test — spawns the exe and reports
 * whether it stayed alive past `timeoutSecs` instead of crashing. Only
 * meaningful for a real local exe path (GOG/Humble); never call this
 * with a Steam/Epic protocol-launch id. See axis_test.rs's doc comment
 * for exactly what this does and doesn't prove — it is a smoke test,
 * not verification of actual offline play. */
export async function runLaunchSmokeTest(
  provider: string,
  id: string,
  exePath: string,
  timeoutSecs = 8,
): Promise<AxisResult> {
  const result = await invoke<AxisResult>("run_launch_smoke_test", {
    exePath,
    timeoutSecs,
  });
  saveLocalAxisResults(provider, id, { first_launch_offline: result });
  return result;
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
