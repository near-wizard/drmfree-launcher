import { invoke } from "@tauri-apps/api/core";
import { recordMatch } from "./gogMatchCache";
import type { StoreListing } from "../types/store";

export type CheckResult =
  | { status: "found"; storeUrl: string }
  | { status: "not-found" }
  | { status: "error" };

// A structural subset of Game (and of WishlistGame, once given a
// provider) — deliberately not typed as `Game` itself, so this same
// check works for a Steam wishlist entry (which isn't an installed
// Game and has no exe_path/install_dir) without an awkward cast.
export interface GogMatchable {
  provider: string;
  id: string;
  name: string;
}

// Shared by GameCard's per-game "Check GOG" button, the library-wide
// bulk check, and the wishlist cross-reference, so all three go
// through identical caching behavior. A failed check is deliberately
// NOT cached as "not found" — that would silently and permanently
// hide a real match behind a transient network blip.
export async function checkGogMatch(game: GogMatchable): Promise<CheckResult> {
  try {
    const match = await invoke<StoreListing | null>("find_gog_match", { title: game.name });
    if (match) {
      recordMatch(game.provider, game.id, { status: "found", storeUrl: match.store_url });
      return { status: "found", storeUrl: match.store_url };
    }
    recordMatch(game.provider, game.id, { status: "not-found" });
    return { status: "not-found" };
  } catch {
    return { status: "error" };
  }
}
