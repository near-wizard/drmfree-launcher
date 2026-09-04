import { useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/analytics";
import {
  loadOnboardingPlatforms,
  saveOnboardingPlatforms,
  type PlatformChoice,
} from "../lib/onboarding";
import { Mascot } from "./Mascot";

const STEP_COUNT = 3;

const PLATFORM_OPTIONS: { id: PlatformChoice; label: string }[] = [
  { id: "steam", label: "Steam" },
  { id: "gog", label: "GOG" },
  { id: "epic", label: "Epic Games" },
  { id: "humble", label: "Humble Bundle" },
  { id: "other", label: "Somewhere else (itch.io, etc.)" },
];

interface OnboardingLightboxProps {
  onDone: () => void;
}

// A short, blocking first-run tour — portaled to document.body for
// the same reason CompareDealModal is: a fixed-position overlay
// nested under a hovered/transformed ancestor gets clipped to that
// ancestor's bounds instead of the full window (found live, see that
// component's own comment). Progressive disclosure: step 2 asks how
// the player gets their games, and step 3 only pitches the features
// actually relevant to that answer — the Steam wishlist
// cross-reference means nothing to someone who never selects Steam.
export function OnboardingLightbox({ onDone }: OnboardingLightboxProps) {
  const [step, setStep] = useState(0);
  const [platforms, setPlatforms] = useState<Set<PlatformChoice>>(
    () => new Set(loadOnboardingPlatforms()),
  );

  function togglePlatform(id: PlatformChoice) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function advance() {
    if (step === 1) {
      saveOnboardingPlatforms(Array.from(platforms));
      track("onboarding_platforms_selected", { count: platforms.size });
    }
    if (step === STEP_COUNT - 1) {
      track("onboarding_completed");
      onDone();
      return;
    }
    setStep((s) => s + 1);
  }

  function skip() {
    track("onboarding_skipped", { step });
    onDone();
  }

  // Nobody picked anything (either skipped the question, or genuinely
  // uses none of the named platforms) — stay inclusive rather than
  // hide a feature that might still apply to them.
  const showEverything = platforms.size === 0;
  const showWishlistBullet = showEverything || platforms.has("steam");
  const showManualBullet = showEverything || platforms.has("other");

  return createPortal(
    <div className="compare-deal-overlay onboarding-overlay">
      <div className="compare-deal-panel onboarding-panel" role="dialog" aria-modal="true" aria-label="Welcome to DRM-Free Launcher">
        {step > 0 && (
          <button className="compare-deal-close" onClick={skip} aria-label="Skip tour">
            ×
          </button>
        )}

        {step === 0 && (
          <div className="onboarding-step">
            <div className="onboarding-hero">
              <Mascot />
            </div>
            <h2 className="compare-deal-title">Welcome to DRM-Free Launcher</h2>
            <p>
              You don't own a Steam library. You own a permission slip Valve can revoke. This
              app looks at what you already have installed and tells you, title by title, when a
              DRM-free version is one click away.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <h2 className="compare-deal-title">How do you get your games?</h2>
            <p>Select any that apply — this just tailors the next screen, nothing else.</p>
            <div className="onboarding-platform-list">
              {PLATFORM_OPTIONS.map((opt) => (
                <label key={opt.id} className="onboarding-platform-option">
                  <input
                    type="checkbox"
                    checked={platforms.has(opt.id)}
                    onChange={() => togglePlatform(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <h2 className="compare-deal-title">What this app does for you</h2>
            <ul className="onboarding-feature-list">
              <li>
                Scans Steam, GOG, Epic, and Humble Bundle installs directly off your disk — no
                accounts, nothing uploaded unless you opt into anonymous analytics.
              </li>
              <li>
                Flags when a game you own has a DRM-free twin, with a real price comparison —
                not just "DRM-free exists somewhere."
              </li>
              {showWishlistBullet && (
                <li>Checks your Steam wishlist against GOG's catalog before you ever buy.</li>
              )}
              {showManualBullet && (
                <li>
                  Lets you add DRM-free games this app can't auto-detect (itch.io purchases,
                  for instance) by hand.
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="onboarding-nav">
          <div className="onboarding-dots" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? "onboarding-dot-active" : ""}`} />
            ))}
          </div>
          <button className="compare-deal-buy-button onboarding-next" onClick={advance}>
            {step === STEP_COUNT - 1 ? "Let's go" : "Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
