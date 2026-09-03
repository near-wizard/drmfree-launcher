import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreedomDashboard } from "./FreedomDashboard";
import type { Game } from "../types/game";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "1",
    name: "Some Game",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "unknown", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

describe("FreedomDashboard", () => {
  it("renders the free/total count and percentage", () => {
    const games = [
      makeGame({ id: "1", drm: { status: "drm-free", source: "gog", method: "storefront_import", verified_on: "2026-01-01" } }),
      makeGame({ id: "2", drm: { status: "drm", source: null, method: null, verified_on: null } }),
    ];
    render(<FreedomDashboard games={games} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders nothing for an empty library", () => {
    const { container } = render(<FreedomDashboard games={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
