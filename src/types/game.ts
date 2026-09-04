import type { DrmAxes } from "./drmAxes";

export type DrmStatus = "drm-free" | "drm" | "unknown";

export type DrmDeterminationMethod =
  | "storefront_import"
  | "publisher_declared"
  | "community_review"
  | "manual_review";

export interface DrmRecord {
  status: DrmStatus;
  source: string | null;
  method: DrmDeterminationMethod | null;
  /** ISO 8601 date (YYYY-MM-DD) the determination was last confirmed accurate. */
  verified_on: string | null;
}

export interface Game {
  id: string;
  name: string;
  provider: string;
  install_dir: string | null;
  exe_path: string | null;
  /** A real filesystem path to the installed exe, used only as a
   *  cover-art fallback (extracting the exe's own icon) — see
   *  get_exe_icon. `null` for providers with a working cover-art
   *  lookup already (Steam, GOG). */
  icon_source?: string | null;
  drm: DrmRecord;
  /** Always `null`/absent from the backend today — see the doc comment
   *  on `Game.drm_axes` in providers/mod.rs. Only ever populated
   *  client-side by folding in a community-consensus lookup, same as
   *  DrmRecord's own consensus overlay (`effectiveDrm` in
   *  GameCard.tsx). */
  drm_axes?: DrmAxes | null;
}
