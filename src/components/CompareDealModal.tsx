import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { track } from "../lib/analytics";
import { comparePrices } from "../lib/price";
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

// Only Steam has a working price lookup today (get_steam_price) — Epic
// has no equivalent command yet, same gap as Epic cover art. Cached
// across modal opens like the other appdetails-backed lookups
// elsewhere in this codebase.
const steamPriceCache = new Map<string, string | null>();

async function fetchSteamPrice(id: string): Promise<string | null> {
  if (steamPriceCache.has(id)) return steamPriceCache.get(id) ?? null;
  const price = await invoke<string | null>("get_steam_price", { id }).catch(() => null);
  steamPriceCache.set(id, price);
  return price;
}

interface CompareDealModalProps {
  gameName: string;
  lockedProviderId: string;
  lockedProviderLabel: string;
  lockedGameId: string;
  gogStoreUrl: string;
  gogPrice: string | null;
  onClose: () => void;
}

export function CompareDealModal({
  gameName,
  lockedProviderId,
  lockedProviderLabel,
  lockedGameId,
  gogStoreUrl,
  gogPrice,
  onClose,
}: CompareDealModalProps) {
  const [lockedPrice, setLockedPrice] = useState<string | null>(null);

  useEffect(() => {
    track("compare_deal_opened", { provider: lockedProviderId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockedProviderId !== "steam") return;
    let cancelled = false;
    fetchSteamPrice(lockedGameId).then((price) => {
      if (!cancelled) setLockedPrice(price);
    });
    return () => {
      cancelled = true;
    };
  }, [lockedProviderId, lockedGameId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const lockedTraits = LOCKED_TRAITS[lockedProviderId] ?? LOCKED_TRAITS_GENERIC;
  const delta = comparePrices(lockedPrice, gogPrice);

  // Portaled to document.body rather than rendered in place: this can
  // be opened from inside a GameCard, whose :hover transform (still
  // active — the mouse is still over the card when its own Compare
  // button is clicked) would otherwise become this fixed-position
  // overlay's containing block and clip it to the card's own small
  // bounds instead of the full window. Found live: the modal rendered
  // fine from WishlistView (siblings, not nested in a hovered card)
  // but was cut off when opened from the library.
  return createPortal(
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
        {delta && delta.cheaper !== "same" && (
          <p className="compare-deal-savings">
            {delta.cheaper === "free"
              ? `Save $${delta.amount.toFixed(2)} buying DRM-free on GOG`
              : `$${delta.amount.toFixed(2)} more on GOG`}
          </p>
        )}
        {delta && delta.cheaper === "same" && <p className="compare-deal-savings">Same price on both</p>}
        <div className="compare-deal-columns">
          <div className="compare-deal-column compare-deal-column-locked">
            <h3>{lockedProviderLabel}</h3>
            <p className="compare-deal-price">{lockedPrice ?? "Price unknown"}</p>
            <ul>
              {lockedTraits.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
          </div>
          <div className="compare-deal-column compare-deal-column-free">
            <h3>GOG (DRM-free)</h3>
            <p className="compare-deal-price">{gogPrice ?? "Price unknown"}</p>
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
    </div>,
    document.body,
  );
}
