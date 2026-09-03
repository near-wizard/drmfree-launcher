import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameList } from "./GameList";
import type { Game } from "../types/game";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: "1",
    name: "Game",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "unknown", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

describe("GameList launching state", () => {
  beforeEach(() => {
    localStorage.clear();
    // Neither the community-consensus nor GOG-cover-art lookups matter
    // for this test — resolve everything to null so both render fast.
    invokeMock.mockResolvedValue(null);
  });

  // Regression test: game.id alone is only unique within one provider
  // (a Steam appid and a GOG product id can collide numerically), so
  // the "launching" flag must key off provider+id, matching how
  // GameList already keys React's `key` prop and lastPlayed.
  it("only shows 'Launching...' on the game whose provider+id matches, even when ids collide across providers", () => {
    const steamGame = makeGame({ provider: "steam", id: "1", name: "Steam Game" });
    const gogGame = makeGame({ provider: "gog", id: "1", name: "GOG Game" });

    render(
      <GameList
        games={[steamGame, gogGame]}
        onLaunch={() => {}}
        launchingId="steam:1"
        providerLabels={{}}
      />,
    );

    const steamCard = screen.getByText("Steam Game").closest(".game-card")!;
    const gogCard = screen.getByText("GOG Game").closest(".game-card")!;

    expect(steamCard).toHaveTextContent("Launching...");
    expect(gogCard).not.toHaveTextContent("Launching...");
    expect(gogCard).toHaveTextContent("Play");
  });

  it("shows no launching state when launchingId is null", () => {
    const steamGame = makeGame({ provider: "steam", id: "1", name: "Steam Game" });
    render(
      <GameList games={[steamGame]} onLaunch={() => {}} launchingId={null} providerLabels={{}} />,
    );
    expect(screen.getByText("Steam Game").closest(".game-card")).not.toHaveTextContent(
      "Launching...",
    );
  });
});
