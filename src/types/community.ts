import type { DrmStatus } from "./game";

export interface CommunityNote {
  status: DrmStatus;
  note: string;
}

export interface CommunityConsensus {
  total: number;
  counts: Record<DrmStatus, number>;
  recentNotes: CommunityNote[];
}
