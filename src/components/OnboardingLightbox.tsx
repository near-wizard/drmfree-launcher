import { useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/analytics";
import {
  loadOnboardingPlatforms,
  saveOnboardingPlatforms,
  type PlatformChoice,
} from "../lib/onboarding";
import { Mascot } from "./Mascot";

const STEP_COUNT = 2;

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

// Just the intro: a welcome screen and the "how do you get your
// games" question. What used to be a third step here (a static bullet
// list of features) is now FeatureTour — a live spotlight tour over
// the real UI instead of a modal describing it, tailored by this
// question's answer (see buildTourSteps in App.tsx). Portaled to
// document.body for the same reason CompareDealModal is: a
// fixed-position overlay nested under a hovered/transformed ancestor
// gets clipped to that ancestor's bounds instead of the full window.
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
    if (step === STEP_COUNT - 1) {
      saveOnboardingPlatforms(Array.from(platforms));
      track("onboarding_platforms_selected", { count: platforms.size });
      onDone();
      return;
    }
    setStep((s) => s + 1);
  }

  function skip() {
    track("onboarding_skipped", { step });
    onDone();
  }

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
              You don't own a DRM-locked library. You own a permission slip the platform can
              revoke. This app looks at what you already have installed and tells you, title by
              title, when a DRM-free version is one click away. Let's take a quick look around.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <h2 className="compare-deal-title">How do you get your games?</h2>
            <p>Select any that apply — this just tailors the tour that follows, nothing else.</p>
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

        <div className="onboarding-nav">
          <div className="onboarding-dots" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? "onboarding-dot-active" : ""}`} />
            ))}
          </div>
          <button className="compare-deal-buy-button onboarding-next" onClick={advance}>
            {step === STEP_COUNT - 1 ? "Start tour" : "Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
