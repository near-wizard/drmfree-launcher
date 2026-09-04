// TS mirror of src-tauri/src/drm_axes.rs — see that file's doc comment
// and decision 0024 for why this exists alongside DrmRecord rather
// than replacing it.

export type AxisResult = "pass" | "fail" | "unknown";

/** A vote on one axis in a submitted report — two-state, unlike
 *  AxisResult: nobody votes "unknown," that's just no report. */
export type AxisVote = "pass" | "fail";

/** One field per freedom test, grouped in the same A–E order as the
 *  Rust struct and the user-facing category headings. */
export interface DrmAxes {
  // A — Network independence
  first_launch_offline: AxisResult;
  continued_offline_play: AxisResult;
  // B — Account independence
  no_publisher_account: AxisResult;
  no_storefront_account: AxisResult;
  // C — Client independence
  no_storefront_client: AxisResult;
  no_launcher: AxisResult;
  // D — Installation portability
  copyable_install: AxisResult;
  reinstallable_from_offline_media: AxisResult;
  // E — External-service independence
  no_publisher_auth_servers: AxisResult;
  no_third_party_services: AxisResult;
  no_server_dependent_core_features: AxisResult;
}

export function unknownAxes(): DrmAxes {
  return {
    first_launch_offline: "unknown",
    continued_offline_play: "unknown",
    no_publisher_account: "unknown",
    no_storefront_account: "unknown",
    no_storefront_client: "unknown",
    no_launcher: "unknown",
    copyable_install: "unknown",
    reinstallable_from_offline_media: "unknown",
    no_publisher_auth_servers: "unknown",
    no_third_party_services: "unknown",
    no_server_dependent_core_features: "unknown",
  };
}

/** A report's votes on any subset of the eleven axes — every field
 *  optional, matching AxisVotes in community.rs field-for-field. */
export type AxisVotes = Partial<Record<keyof DrmAxes, AxisVote>>;

export interface AxisCounts {
  pass: number;
  fail: number;
  total: number;
}

/** Raw per-axis vote counts as returned by GET /consensus — mirrors
 *  AxisConsensusCounts in community.rs. */
export type AxisConsensusCounts = Record<keyof DrmAxes, AxisCounts>;

/** The five user-facing category groupings, in display order — the
 *  single source of truth CommunityReport.tsx and GameCard.tsx both
 *  render from, so the grouping can't drift between the two. */
export const AXIS_CATEGORIES: { label: string; axes: (keyof DrmAxes)[] }[] = [
  { label: "Network independence", axes: ["first_launch_offline", "continued_offline_play"] },
  { label: "Account independence", axes: ["no_publisher_account", "no_storefront_account"] },
  { label: "Client independence", axes: ["no_storefront_client", "no_launcher"] },
  { label: "Installation portability", axes: ["copyable_install", "reinstallable_from_offline_media"] },
  {
    label: "External-service independence",
    axes: ["no_publisher_auth_servers", "no_third_party_services", "no_server_dependent_core_features"],
  },
];

export const AXIS_LABELS: Record<keyof DrmAxes, string> = {
  first_launch_offline: "Launches offline on first run",
  continued_offline_play: "Playable indefinitely offline",
  no_publisher_account: "No publisher account required",
  no_storefront_account: "No storefront account required",
  no_storefront_client: "Runs without the storefront client open",
  no_launcher: "Launches directly, no launcher at all",
  copyable_install: "Install folder can be copied to another machine",
  reinstallable_from_offline_media: "Reinstallable from offline files alone",
  no_publisher_auth_servers: "No publisher-run auth servers required",
  no_third_party_services: "No third-party services required",
  no_server_dependent_core_features: "Core gameplay works with no servers at all",
};
