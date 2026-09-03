import { getVersion } from "@tauri-apps/api/app";

const REPO_ISSUE_URL = "https://github.com/near-wizard/drmfree-launcher/issues/new";

// Best-effort OS label from the webview's own user agent — avoids
// pulling in @tauri-apps/plugin-os for a "nice to have" detail. Not
// meant to be precise, just enough context for a bug report.
function guessPlatform(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

// Opens GitHub's issue form pre-selected (?template=) with the
// "App version / OS" field pre-filled — GitHub Issue Forms accept a
// query param per field `id` (see .github/ISSUE_TEMPLATE/change_request.yml)
// to pre-populate it.
export async function buildReportIssueUrl(): Promise<string> {
  const version = await getVersion().catch(() => "unknown");
  const context = `App version: ${version}\nOS: ${guessPlatform()}`;

  const params = new URLSearchParams({
    template: "change_request.yml",
    context,
  });
  return `${REPO_ISSUE_URL}?${params.toString()}`;
}
