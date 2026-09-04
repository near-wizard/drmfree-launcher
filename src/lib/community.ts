// Client for the community DRM-status verification feature. The Rust
// side (src-tauri/src/community.rs) silently returns "not configured"
// when no COMMUNITY_API_URL was baked into this build, so every
// function here is written to degrade to "the feature just isn't
// there" rather than surfacing an error state — see CommunityReport.tsx.
import { invoke } from "@tauri-apps/api/core";
import type { DrmStatus } from "../types/game";
import type { CommunityConsensus } from "../types/community";
import type { AxisVotes } from "../types/drmAxes";

const CLIENT_ID_KEY = "drmfree-launcher:community-client-id";

// An opaque per-install id, not an account — see decisions/0008 and
// drmfree-community's README for why this stays anonymous by design.
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    // Best-effort only — a fresh id every call is worse than crashing,
    // but still lets the feature function within a single session.
    return crypto.randomUUID();
  }
}

// The Rust command distinguishes "not configured" (resolves to `null`)
// from an actual failure (rejects) — so a rejection here is always a
// real problem (offline, DNS hiccup, an overloaded free-tier tunnel
// under a burst of concurrent requests), never the "feature is off"
// signal. One retry after a short delay turns a single transient
// failure into a normal result instead of permanently hiding the
// report widget for that card for the rest of the session — found by
// exactly that happening in testing when ~30 cards all queried a
// free ngrok tunnel at once.
export async function getCommunityConsensus(
  provider: string,
  gameId: string,
): Promise<CommunityConsensus | null> {
  // A large library mounts every card's consensus fetch in the same
  // tick — spread them out a little so a big library doesn't open
  // dozens of simultaneous connections against what might be a small
  // free-tier backend.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 250));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await invoke<CommunityConsensus | null>("get_community_consensus", {
        provider,
        gameId,
      });
    } catch (e) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 400));
        continue;
      }
      console.error("community consensus fetch failed after retry:", e);
      return null;
    }
  }
  return null;
}

export async function submitDrmReport(
  provider: string,
  gameId: string,
  title: string,
  status: DrmStatus,
  note?: string,
  axes?: AxisVotes,
): Promise<boolean> {
  try {
    await invoke("submit_drm_report", {
      provider,
      gameId,
      title,
      status,
      note: note || null,
      clientId: getClientId(),
      // Omitted (undefined) rather than {} when nothing was tested —
      // matches the Rust side skipping the field entirely for a
      // status-only report, see community.rs's SubmitReportBody.
      axes: axes && Object.keys(axes).length > 0 ? axes : null,
    });
    return true;
  } catch {
    return false;
  }
}
