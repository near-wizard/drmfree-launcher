// Client for the community DRM-status verification feature. The Rust
// side (src-tauri/src/community.rs) silently returns "not configured"
// when no COMMUNITY_API_URL was baked into this build, so every
// function here is written to degrade to "the feature just isn't
// there" rather than surfacing an error state — see CommunityReport.tsx.
import { invoke } from "@tauri-apps/api/core";
import type { DrmStatus } from "../types/game";
import type { CommunityConsensus } from "../types/community";

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

export async function getCommunityConsensus(
  provider: string,
  gameId: string,
): Promise<CommunityConsensus | null> {
  try {
    return await invoke<CommunityConsensus | null>("get_community_consensus", {
      provider,
      gameId,
    });
  } catch {
    return null;
  }
}

export async function submitDrmReport(
  provider: string,
  gameId: string,
  title: string,
  status: DrmStatus,
  note?: string,
): Promise<boolean> {
  try {
    await invoke("submit_drm_report", {
      provider,
      gameId,
      title,
      status,
      note: note || null,
      clientId: getClientId(),
    });
    return true;
  } catch {
    return false;
  }
}
