import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameCard } from "./GameCard";
import type { Game } from "../types/game";
import { unknownAxes } from "../types/drmAxes";

const UNKNOWN_AXES = unknownAxes();

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
const revealItemInDirMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: revealItemInDirMock }));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "1",
    name: "Mystery Game",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "unknown", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

describe("GameCard DRM badge with community consensus", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("shows the raw 'unknown' badge until a strong community consensus exists", async () => {
    invokeMock.mockResolvedValue({ total: 1, counts: { "drm-free": 1, drm: 0, unknown: 0 }, recentNotes: [] });
    render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(await screen.findByText("DRM Unknown")).toBeInTheDocument();
  });

  it("promotes the badge to the community-derived status once consensus is strong", async () => {
    invokeMock.mockResolvedValue({ total: 4, counts: { "drm-free": 4, drm: 0, unknown: 0 }, recentNotes: [] });
    const { container } = render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => {
      const badge = container.querySelector(".drm-badge")!;
      expect(badge).toHaveTextContent("DRM-Free");
      expect(badge).toHaveAttribute("title", expect.stringContaining("community review"));
    });
  });

  it("never overrides a badge that already has a verified local determination", async () => {
    invokeMock.mockResolvedValue({ total: 10, counts: { "drm-free": 0, drm: 10, unknown: 0 }, recentNotes: [] });
    const game = makeGame({
      drm: { status: "drm-free", source: "GOG", method: "storefront_import", verified_on: "2026-01-01" },
    });
    const { container } = render(
      <GameCard game={game} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const badge = container.querySelector(".drm-badge")!;
    expect(badge).toHaveTextContent("DRM-Free");
    expect(badge).toHaveAttribute("title", expect.stringContaining("storefront policy"));
  });

  it("renders no community report widget when the backend isn't configured", async () => {
    invokeMock.mockResolvedValue(null);
    render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByText("Report")).not.toBeInTheDocument();
  });
});

describe("GameCard exe-icon cover-art fallback", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("falls back to the exe's own icon when the provider has no cover-art lookup", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_exe_icon") return Promise.resolve("data:image/png;base64,ABC");
      return Promise.resolve(null);
    });
    const game = makeGame({
      provider: "epic",
      icon_source: "C:\\Program Files\\Epic Games\\ForTheKing\\FTK.exe",
    });
    const { container } = render(
      <GameCard game={game} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_exe_icon", {
        path: "C:\\Program Files\\Epic Games\\ForTheKing\\FTK.exe",
      });
    });
    await waitFor(() => {
      const img = container.querySelector("img.game-thumb");
      expect(img).toHaveAttribute("src", "data:image/png;base64,ABC");
    });
  });

  it("never calls get_exe_icon when the game has no icon_source", async () => {
    invokeMock.mockResolvedValue(null);
    render(
      <GameCard game={makeGame({ provider: "steam" })} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith("get_exe_icon", expect.anything());
  });
});

describe("GameCard axis pips", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("renders no axis pips when there is no axis consensus data", async () => {
    invokeMock.mockResolvedValue({ total: 4, counts: { "drm-free": 4, drm: 0, unknown: 0 }, recentNotes: [] });
    const { container } = render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(container.querySelector(".axis-pips-row")).not.toBeInTheDocument();
  });

  it("shows a pass pip for a category once enough reports agree", async () => {
    invokeMock.mockResolvedValue({
      total: 3,
      counts: { "drm-free": 0, drm: 0, unknown: 3 },
      recentNotes: [],
      axes: {
        first_launch_offline: { pass: 3, fail: 0, total: 3 },
        continued_offline_play: { pass: 0, fail: 0, total: 0 },
        no_publisher_account: { pass: 0, fail: 0, total: 0 },
        no_storefront_account: { pass: 0, fail: 0, total: 0 },
        no_storefront_client: { pass: 0, fail: 0, total: 0 },
        no_launcher: { pass: 0, fail: 0, total: 0 },
        copyable_install: { pass: 0, fail: 0, total: 0 },
        reinstallable_from_offline_media: { pass: 0, fail: 0, total: 0 },
        no_publisher_auth_servers: { pass: 0, fail: 0, total: 0 },
        no_third_party_services: { pass: 0, fail: 0, total: 0 },
        no_server_dependent_core_features: { pass: 0, fail: 0, total: 0 },
      },
    });
    const { container } = render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".axis-pip-pass")).toBeInTheDocument();
    });
  });

  it("expands to the full per-axis breakdown on click", async () => {
    invokeMock.mockResolvedValue({
      total: 3,
      counts: { "drm-free": 0, drm: 0, unknown: 3 },
      recentNotes: [],
      axes: {
        first_launch_offline: { pass: 3, fail: 0, total: 3 },
        continued_offline_play: { pass: 0, fail: 0, total: 0 },
        no_publisher_account: { pass: 0, fail: 0, total: 0 },
        no_storefront_account: { pass: 0, fail: 0, total: 0 },
        no_storefront_client: { pass: 0, fail: 0, total: 0 },
        no_launcher: { pass: 0, fail: 0, total: 0 },
        copyable_install: { pass: 0, fail: 0, total: 0 },
        reinstallable_from_offline_media: { pass: 0, fail: 0, total: 0 },
        no_publisher_auth_servers: { pass: 0, fail: 0, total: 0 },
        no_third_party_services: { pass: 0, fail: 0, total: 0 },
        no_server_dependent_core_features: { pass: 0, fail: 0, total: 0 },
      },
    });
    const user = userEvent.setup();
    const { container } = render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    const toggle = await screen.findByTitle("Community-reported freedom test results");
    expect(container.querySelector(".axis-pips-detail")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(container.querySelector(".axis-pips-detail")).toHaveTextContent("Launches offline on first run");
  });
});

describe("GameCard local automated axis tests", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  function routeInvoke(overrides: Record<string, unknown>) {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd in overrides) return Promise.resolve(overrides[cmd]);
      return Promise.resolve(null);
    });
  }

  it("shows the your-machine pips row once structural axes resolve for a GOG game", async () => {
    routeInvoke({
      structural_axes: { ...UNKNOWN_AXES, no_storefront_client: "pass", no_launcher: "pass" },
    });
    const { container } = render(
      <GameCard game={makeGame({ provider: "gog" })} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".local-axis-pips-row")).toBeInTheDocument();
    });
  });

  it("renders no your-machine pips row for a manual entry (structural_axes is never called)", async () => {
    routeInvoke({});
    const { container } = render(
      <GameCard
        game={makeGame({ provider: "manual" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith("structural_axes", expect.anything());
    expect(container.querySelector(".local-axis-pips-row")).not.toBeInTheDocument();
  });

  it("offers the audit for a GOG game with a real exe path", async () => {
    routeInvoke({});
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    expect(await screen.findByRole("button", { name: "Run audit" })).toBeInTheDocument();
  });

  it("does not offer the audit for a Steam game (no real exe path)", async () => {
    routeInvoke({});
    render(
      <GameCard
        game={makeGame({ provider: "steam", exe_path: null })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Run audit" })).not.toBeInTheDocument();
  });

  it("running the audit updates the your-machine pips row without touching the community backend", async () => {
    routeInvoke({ run_launch_audit: { first_launch_offline: "pass", no_third_party_services: "pass" } });
    const user = userEvent.setup();
    const { container } = render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Run audit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("run_launch_audit", {
        exePath: "C:\\Games\\X\\X.exe",
        timeoutSecs: 8,
      });
    });
    await waitFor(() => {
      expect(container.querySelector(".local-axis-pips-row")).toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith("submit_drm_report", expect.anything());
  });

  it("auto-submits the audit result when the auto-submit checkbox is checked", async () => {
    routeInvoke({
      run_launch_audit: { first_launch_offline: "pass", no_third_party_services: "pass" },
      submit_drm_report: undefined,
      get_community_consensus: { total: 1, counts: { "drm-free": 0, drm: 0, unknown: 1 }, recentNotes: [] },
    });
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(await screen.findByRole("checkbox", { name: "Auto-submit results" }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "submit_drm_report",
        expect.objectContaining({
          axes: { first_launch_offline: "pass", no_third_party_services: "pass" },
        }),
      );
    });
  });

  it("does not submit anything when auto-submit is left unchecked", async () => {
    routeInvoke({ run_launch_audit: { first_launch_offline: "pass", no_third_party_services: "pass" } });
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Run audit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("run_launch_audit", expect.anything());
    });
    expect(invokeMock).not.toHaveBeenCalledWith("submit_drm_report", expect.anything());
  });

  it("offers the portability test only when both a real exe path and install dir are known", async () => {
    routeInvoke({});
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe", install_dir: "C:\\Games\\X" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    expect(await screen.findByRole("button", { name: "Test copyable install" })).toBeInTheDocument();
  });

  it("does not offer the portability test without a known install dir", async () => {
    routeInvoke({});
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe", install_dir: null })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Test copyable install" })).not.toBeInTheDocument();
  });

  it("running the portability test calls run_portability_audit and updates the your-machine pips row", async () => {
    routeInvoke({ run_portability_audit: "pass" });
    const user = userEvent.setup();
    const { container } = render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe", install_dir: "C:\\Games\\X" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Test copyable install" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("run_portability_audit", {
        installDir: "C:\\Games\\X",
        exePath: "C:\\Games\\X\\X.exe",
        timeoutSecs: 8,
      });
    });
    await waitFor(() => {
      expect(container.querySelector(".axis-pip-pass")).toBeInTheDocument();
    });
  });

  it("shows an inline error when the portability test rejects (e.g. not enough disk space)", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "run_portability_audit") return Promise.reject(new Error("not enough free space"));
      return Promise.resolve(null);
    });
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeGame({ provider: "gog", exe_path: "C:\\Games\\X\\X.exe", install_dir: "C:\\Games\\X" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Test copyable install" }));
    expect(await screen.findByText("not enough free space")).toBeInTheDocument();
  });

  it("does not render Share this result before the community backend reports it isn't configured", async () => {
    // Regression: the button used to render as soon as local axes
    // resolved, independent of whether CommunityReport had mounted
    // yet — a click in that window set a share signal with nothing to
    // receive it, silently losing the share. Gating on the same
    // consensusLoaded/consensus condition CommunityReport itself uses
    // guarantees the button never outpaces the thing it targets.
    routeInvoke({
      structural_axes: { ...UNKNOWN_AXES, no_storefront_client: "pass", no_launcher: "pass" },
      get_community_consensus: null, // backend not configured
    });
    render(
      <GameCard game={makeGame({ provider: "gog" })} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => {
      expect(screen.queryByText("your machine:")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Share this result" })).not.toBeInTheDocument();
  });

  it("Share this result pre-fills the community report section rather than submitting anything", async () => {
    routeInvoke({
      structural_axes: { ...UNKNOWN_AXES, no_storefront_client: "pass", no_launcher: "pass" },
      get_community_consensus: { total: 0, counts: { "drm-free": 0, drm: 0, unknown: 0 }, recentNotes: [] },
    });
    const user = userEvent.setup();
    render(
      <GameCard game={makeGame({ provider: "gog" })} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    // The button itself is gated on the same consensus-loaded condition
    // CommunityReport is, so finding it already guarantees that
    // component exists to receive the prefill — see the fix in
    // GameCard.tsx: sharing before the community section has loaded
    // would otherwise fire into a component that doesn't exist yet.
    await user.click(await screen.findByRole("button", { name: "Share this result" }));

    const group = await screen.findByRole("group", { name: "Runs without the storefront client open" });
    expect((group.children[0] as HTMLElement).className).toContain("freedom-test-vote-active");
    expect(invokeMock).not.toHaveBeenCalledWith("submit_drm_report", expect.anything());
  });
});

describe("GameCard open-install-folder action", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
  });

  it("does not render the folder button when install_dir is unknown", async () => {
    render(
      <GameCard
        game={makeGame({ install_dir: null })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Open install folder" })).not.toBeInTheDocument();
  });

  it("asks the backend to open the install folder for this exact game when clicked", async () => {
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeGame({ id: "248820", provider: "steam", install_dir: "C:\\Games\\Risk of Rain" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    const button = await screen.findByRole("button", { name: "Open install folder" });
    invokeMock.mockClear();
    await user.click(button);
    expect(invokeMock).toHaveBeenCalledWith("open_install_folder", {
      provider: "steam",
      id: "248820",
    });
  });
});

describe("GameCard manual entries", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
    revealItemInDirMock.mockReset();
    revealItemInDirMock.mockResolvedValue(undefined);
  });

  function makeManualGame(overrides: Partial<Game> = {}): Game {
    return makeGame({
      provider: "manual",
      drm: { status: "drm-free", source: "self-reported", method: "manual_review", verified_on: "2026-01-01" },
      ...overrides,
    });
  }

  it("does not render a 'Check GOG' control for a manual entry", async () => {
    render(
      <GameCard game={makeManualGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    expect(screen.queryByRole("button", { name: "Check GOG" })).not.toBeInTheDocument();
  });

  it("does not fetch community consensus for a manual entry", async () => {
    render(
      <GameCard game={makeManualGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    // getCommunityConsensus jitters its own request by up to 250ms
    // (see community.ts), so a sibling test's still-pending fetch for
    // an unrelated game can resolve during this window — assert on
    // what this test actually cares about (no manual-provider lookup)
    // rather than a blanket "invoke was never called at all," which
    // is fragile against that unrelated async leakage.
    await new Promise((r) => setTimeout(r, 0));
    expect(invokeMock).not.toHaveBeenCalledWith(
      "get_community_consensus",
      expect.objectContaining({ provider: "manual" }),
    );
  });

  it("disables Play with an explanatory title when no executable is set", () => {
    render(
      <GameCard
        game={makeManualGame({ exe_path: null })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    const play = screen.getByRole("button", { name: "Play" });
    expect(play).toBeDisabled();
    expect(play).toHaveAttribute("title", "No executable set for this entry");
  });

  it("enables Play once an executable is set", () => {
    render(
      <GameCard
        game={makeManualGame({ exe_path: "C:\\Games\\Celeste.exe" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).not.toBeDisabled();
  });

  it("opens the install folder client-side via revealItemInDir, not the backend command", async () => {
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeManualGame({ install_dir: "C:\\Games\\Celeste" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open install folder" }));
    expect(revealItemInDirMock).toHaveBeenCalledWith("C:\\Games\\Celeste");
    expect(invokeMock).not.toHaveBeenCalledWith("open_install_folder", expect.anything());
  });

  it("shows a remove button that removes the entry from storage and notifies the parent", async () => {
    const user = userEvent.setup();
    const onRemoveManual = vi.fn();
    localStorage.setItem(
      "drmfree-launcher:manual-games",
      JSON.stringify([{ id: "1", name: "Mystery Game", exePath: null, installDir: null, addedAt: 0 }]),
    );
    render(
      <GameCard
        game={makeManualGame()}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{}}
        onRemoveManual={onRemoveManual}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove this manual entry" }));
    expect(onRemoveManual).toHaveBeenCalledWith("1");
    expect(JSON.parse(localStorage.getItem("drmfree-launcher:manual-games")!)).toEqual([]);
  });
});

describe("GameCard multiplayer-needs-platform flag", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
  });

  function makeDrmFreeGame(overrides: Partial<Game> = {}): Game {
    return makeGame({
      drm: { status: "drm-free", source: "gog", method: "storefront_import", verified_on: "2026-01-01" },
      ...overrides,
    });
  }

  it("does not show the toggle for a game that isn't DRM-free", () => {
    render(
      <GameCard game={makeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    expect(screen.queryByRole("button", { name: "Mark multiplayer platform requirement" })).not.toBeInTheDocument();
  });

  it("shows the toggle and no badge by default for a DRM-free game", () => {
    render(
      <GameCard game={makeDrmFreeGame()} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    expect(screen.getByRole("button", { name: "Mark multiplayer platform requirement" })).toBeInTheDocument();
    expect(screen.queryByText(/MP needs/)).not.toBeInTheDocument();
  });

  it("shows the badge and persists the flag after toggling on", async () => {
    const user = userEvent.setup();
    render(
      <GameCard
        game={makeDrmFreeGame({ provider: "steam", id: "248820" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{ steam: "Steam" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Mark multiplayer platform requirement" }));
    expect(screen.getByText("MP needs Steam")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("drmfree-launcher:multiplayer-needs-platform")!)).toEqual({
      "steam:248820": true,
    });
  });

  it("clears the badge and storage after toggling back off", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "drmfree-launcher:multiplayer-needs-platform",
      JSON.stringify({ "steam:248820": true }),
    );
    render(
      <GameCard
        game={makeDrmFreeGame({ provider: "steam", id: "248820" })}
        onLaunch={() => {}}
        launching={false}
        providerLabels={{ steam: "Steam" }}
      />,
    );
    expect(screen.getByText("MP needs Steam")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Un-mark multiplayer platform requirement" }));
    expect(screen.queryByText("MP needs Steam")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("drmfree-launcher:multiplayer-needs-platform")!)).toEqual({});
  });
});
