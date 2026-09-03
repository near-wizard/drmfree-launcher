import { getVersion } from "@tauri-apps/api/app";

const LATEST_RELEASE_API = "https://api.github.com/repos/near-wizard/drmfree-launcher/releases/latest";
export const RELEASES_PAGE_URL = "https://github.com/near-wizard/drmfree-launcher/releases";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

// Naive numeric semver comparison (major.minor.patch) — no pre-release/
// build-metadata handling. Good enough for this project's plain "vX.Y.Z"
// tags; not meant to be a general semver library.
function isNewer(latest: string, current: string): boolean {
  const toParts = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPatch] = toParts(latest);
  const [cMaj, cMin, cPatch] = toParts(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

// No signing/auto-install here — this is a lightweight "is there
// something newer" check only, linking out to the Releases page for
// the user to grab manually. A full auto-updater needs a signing-key
// setup that's its own decision, not something to improvise here.
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const currentVersion = await getVersion();
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const latestVersion = String(data.tag_name ?? "").replace(/^v/, "");
    if (!latestVersion) return null;

    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewer(latestVersion, currentVersion),
    };
  } catch {
    // Best-effort only — offline, rate-limited, or no releases yet are
    // all fine; just don't show an update banner.
    return null;
  }
}
