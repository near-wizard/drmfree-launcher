import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GameCard } from "./GameCard";
import type { Game } from "../types/game";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

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
      drm: { status: "drm-free", source: "GOG", method: "gog_import", verified_on: "2026-01-01" },
    });
    const { container } = render(
      <GameCard game={game} onLaunch={() => {}} launching={false} providerLabels={{}} />,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const badge = container.querySelector(".drm-badge")!;
    expect(badge).toHaveTextContent("DRM-Free");
    expect(badge).toHaveAttribute("title", expect.stringContaining("GOG storefront policy"));
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
