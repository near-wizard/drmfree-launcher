import { invoke } from "@tauri-apps/api/core";
import { recordMatch } from "./gogMatchCache";
import type { Game } from "../types/game";
import type { StoreListing } from "../types/store";

export type CheckResult =
  | { status: "found"; storeUrl: string }
  | { status: "not-found" }
  | { status: "error" };

// Shared by GameCard's per-game "Check GOG" button and the library-wide
// bulk check, so both go through identical caching behavior. A failed
// check is deliberately NOT cached as "not found" — that would
// silently and permanently hide a real match behind a transient
// network blip.
export async function checkGogMatch(game: Game): Promise<CheckResult> {
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
