export type DrmStatus = "drm-free" | "drm" | "unknown";

export type DrmDeterminationMethod =
  | "gog_import"
  | "publisher_declared"
  | "community_review"
  | "manual_review";

export interface DrmRecord {
  status: DrmStatus;
  source: string | null;
  method: DrmDeterminationMethod | null;
}

export interface Game {
  id: string;
  name: string;
  provider: string;
  install_dir: string | null;
  exe_path: string | null;
  drm: DrmRecord;
}
