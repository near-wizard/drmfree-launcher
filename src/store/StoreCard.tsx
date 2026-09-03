import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { track } from "../lib/analytics";
import type { StoreListing } from "../types/store";

export function StoreCard({ listing }: { listing: StoreListing }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="store-card">
      {listing.cover_url && !imageFailed ? (
        <img
          className="store-card-cover"
          src={listing.cover_url}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="store-card-cover store-card-cover-placeholder" aria-hidden="true">
          {listing.title.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="store-card-body">
        <span className="store-card-title">{listing.title}</span>
        {listing.price && <span className="store-card-price">{listing.price}</span>}
      </div>
      <button
        onClick={() => {
          track("store_buy_clicked");
          openUrl(listing.store_url);
        }}
      >
        Buy on GOG
      </button>
    </div>
  );
}
