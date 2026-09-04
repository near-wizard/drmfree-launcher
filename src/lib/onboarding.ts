const SEEN_KEY = "drmfree-launcher:onboarding-seen";
const PLATFORMS_KEY = "drmfree-launcher:onboarding-platforms";

// A one-time first-run flag, same pattern as lastTab.ts/consent —
// separate from analytics consent (decision 0012) on purpose: seeing
// the tour and opting into analytics are unrelated choices, and
// showing both a blocking lightbox and the consent banner at once
// would be a lot to throw at someone's very first launch. The banner
// stays a non-blocking strip; this is the one thing that blocks
// interaction, briefly, on a first run only.
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "true";
  } catch {
    return true; // fail open — never trap a user in a lightbox loop over a storage error
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "true");
  } catch {
    // Best-effort only.
  }
}

export type PlatformChoice = "steam" | "gog" | "epic" | "humble" | "other";

// What the onboarding lightbox asks in its "how do you get your
// games" step, purely to tailor which of ITS OWN bullets it shows
// next (e.g. no point pitching the Steam wishlist cross-reference to
// someone who said they don't use Steam) — this deliberately does not
// hide or reorder anything in the app itself (the Wishlist tab, the
// library filters, etc. all stay exactly as they are regardless of
// this answer). Persisted so re-opening the tour later doesn't reset
// an answer already given, not for any other feature to read.
export function loadOnboardingPlatforms(): PlatformChoice[] {
  try {
    const raw = localStorage.getItem(PLATFORMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOnboardingPlatforms(platforms: PlatformChoice[]): void {
  try {
    localStorage.setItem(PLATFORMS_KEY, JSON.stringify(platforms));
  } catch {
    // Best-effort only.
  }
}
