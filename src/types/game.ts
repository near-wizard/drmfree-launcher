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
  drm: DrmRecord;
}
