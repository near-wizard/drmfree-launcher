import posthog from "posthog-js";

const CONSENT_KEY = "drmfree-launcher:analytics-consent";
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

export type ConsentStatus = "unset" | "granted" | "denied";

let initialized = false;

export function getConsentStatus(): ConsentStatus {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === "granted" || raw === "denied" ? raw : "unset";
  } catch {
    return "unset";
  }
}

function setConsentStatus(status: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, status);
  } catch {
    // Best-effort only.
  }
}

// Opt-in, not opt-out: nothing is sent — not even a single request to
// PostHog — until the user explicitly grants consent via the banner.
// Declining (or never answering) means genuinely zero network activity
// from this module, not "collected but anonymized" or "collected but
// unsent". See docs/decisions/0012-opt-in-analytics.md.
export function grantConsent() {
  setConsentStatus("granted");
  initPostHog();
}

export function denyConsent() {
  setConsentStatus("denied");
  if (initialized) {
    posthog.opt_out_capturing();
  }
}

function initPostHog() {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    // No project key configured (e.g. a dev build, or before the real
    // key is provisioned) — consent is still recorded above, but there's
    // nowhere to actually send events. Silent no-op, not an error.
    return;
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We call capture() explicitly per action instead — no automatic
    // pageview/click capture, since this is a single-page desktop app
    // and "each action" should be a deliberate, named event, not
    // whatever PostHog's DOM autocapture happens to see.
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage",
  });
  initialized = true;
}

// Call once on app start. Only actually initializes PostHog if consent
// was already granted in a previous session — never sends anything on
// an "unset" or "denied" status.
export function initAnalyticsIfConsented() {
  if (getConsentStatus() === "granted") {
    initPostHog();
  }
}

// Fire-and-forget event capture. No-ops entirely (no PostHog call at
// all) unless consent is granted — checked per-call, not just at init,
// so revoking consent mid-session stops new events immediately without
// needing a restart.
//
// Deliberately never pass game names, search query text, or anything
// else that identifies specific library contents — event names and
// coarse categorical properties only (a provider id, a boolean, a
// count). What "each action" tracks is that an action of a given kind
// happened, not what specific game/text was involved.
export function track(event: string, properties?: Record<string, unknown>) {
  if (getConsentStatus() !== "granted") return;
  if (!initialized) initPostHog();
  if (!initialized) return; // still no key configured
  posthog.capture(event, properties);
}
