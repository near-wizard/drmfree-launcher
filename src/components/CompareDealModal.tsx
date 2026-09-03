import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { track } from "../lib/analytics";
import { PawIcon } from "./PawIcon";

// Generic, honest bullets about what a purchase on each kind of
// platform actually gets you — not a caricature. Falls back to
// LOCKED_TRAITS_GENERIC for any provider without a specific entry
// (currently only Steam and Epic detect installs, but this shouldn't
// silently break if a third one is added later).
const LOCKED_TRAITS: Record<string, string[]> = {
  steam: [
    "A license Valve can revoke, region-lock, or delist",
    "Requires the Steam client/account to launch",
    "Can't be resold or transferred",
  ],
  epic: [
    "A license Epic can revoke, region-lock, or delist",
    "Requires the Epic Games launcher/account to launch",
    "Can't be resold or transferred",
  ],
};
const LOCKED_TRAITS_GENERIC = [
  "A revocable license, not a copy you own",
  "Requires the storefront's own client/account to launch",
  "Can't be resold or transferred",
];

const GOG_TRAITS = [
  "Yours to keep — no account needed to launch it",
  "A real offline installer, archivable on your own drive",
  "Nothing to revoke: it's just files on your disk",
];

interface CompareDealModalProps {
  gameName: string;
  lockedProviderId: string;
  lockedProviderLabel: string;
  gogStoreUrl: string;
  onClose: () => void;
}

export function CompareDealModal({
  gameName,
  lockedProviderId,
  lockedProviderLabel,
  gogStoreUrl,
  onClose,
}: CompareDealModalProps) {
  useEffect(() => {
    track("compare_deal_opened", { provider: lockedProviderId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const lockedTraits = LOCKED_TRAITS[lockedProviderId] ?? LOCKED_TRAITS_GENERIC;

  return (
    <div className="compare-deal-overlay" onClick={onClose}>
      <div
        className="compare-deal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Compare the deal for ${gameName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="compare-deal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="compare-deal-title">{gameName}</h2>
        <div className="compare-deal-columns">
          <div className="compare-deal-column compare-deal-column-locked">
            <h3>{lockedProviderLabel}</h3>
            <ul>
              {lockedTraits.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
          </div>
          <div className="compare-deal-column compare-deal-column-free">
            <h3>GOG (DRM-free)</h3>
            <ul>
              {GOG_TRAITS.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
          </div>
        </div>
        <button
          className="compare-deal-buy-button"
          onClick={() => {
            track("compare_deal_buy_clicked", { provider: lockedProviderId });
            openUrl(gogStoreUrl);
          }}
        >
          <PawIcon />
          Buy DRM-free on GOG
        </button>
      </div>
    </div>
  );
}
