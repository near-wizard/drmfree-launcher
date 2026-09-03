import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const RELEASES_PAGE_URL = "https://github.com/near-wizard/drmfree-launcher/releases";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

// The plugin's `Update` handle carries the actual download; kept here
// (not in component state, which can't hold a non-serializable class
// instance cleanly) so installUpdate() can reuse the check that
// already ran instead of re-checking.
let pendingUpdate: Update | null = null;

// Reads from a signed `latest.json` (see tauri.conf.json's updater
// endpoint and decision 0015) rather than the old approach of asking
// GitHub's API for the latest tag and comparing semver by hand — this
// is what actually lets installUpdate() download+verify+install
// below, not just detect that something's newer.
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const currentVersion = await getVersion();
    const update = await check();
    if (!update) return null;
    pendingUpdate = update;
    return {
      currentVersion,
      latestVersion: update.version,
      updateAvailable: true,
    };
  } catch {
    // Best-effort only — offline, no endpoint configured (dev builds),
    // or nothing published yet are all fine; just don't show a banner.
    pendingUpdate = null;
    return null;
  }
}

export type UpdateProgress = { downloaded: number; total: number | null };

// Downloads, verifies (against the pubkey in tauri.conf.json), installs,
// and restarts the app. Throws if checkForUpdate() wasn't called first
// or found nothing — callers should only offer this after a positive
// checkForUpdate() result.
export async function installUpdate(onProgress?: (p: UpdateProgress) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error("installUpdate called with no update pending — call checkForUpdate() first");
  }
  let downloaded = 0;
  let total: number | null = null;
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total });
    }
  });
  await relaunch();
}
