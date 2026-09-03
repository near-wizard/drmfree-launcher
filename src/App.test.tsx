import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "./types/game";

// App.tsx is the largest, most stateful file in the frontend (tab
// switching, library search/filter/sort, consent banner, update
// banner, launch flow) and had zero test coverage before this file —
// everything else under src/ already has at least a unit test. These
// tests exercise it through the DOM the way a user would, with all
// Tauri-side calls mocked.

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));

// posthog-js is a real network client; App.tsx pulls in the real
// lib/analytics.ts (not mocked, so consent-banner/localStorage wiring
// stays genuine), so it's posthog-js itself that needs stubbing —
// same approach as analytics.test.ts.
vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), capture: vi.fn(), opt_out_capturing: vi.fn() },
}));

// checkForUpdate pulls in @tauri-apps/plugin-updater and
// @tauri-apps/plugin-process, which have no bearing on anything under
// test here — stub the whole module rather than mocking three more
// Tauri plugins just to reach "no update available".
vi.mock("./lib/checkForUpdate", () => ({
  checkForUpdate: vi.fn().mockResolvedValue(null),
  installUpdate: vi.fn(),
  RELEASES_PAGE_URL: "https://example.com/releases",
}));

// StoreView has its own (future) test surface; here it only needs to
// be distinguishable on screen so tab-switching can be asserted
// without also asserting on StoreView's internal search/pagination
// behavior.
vi.mock("./store/StoreView", () => ({
  StoreView: () => <div data-testid="store-view-stub">Store stub</div>,
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "1",
    name: "Braid",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "unknown", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

// invoke() is called for several commands (list_games, list_providers,
// launch_game, get_community_consensus, get_gog_cover_art, ...);
// route by command name so each test only has to specify the ones it
// cares about.
function mockInvoke(handlers: Record<string, (args: unknown) => unknown>) {
  invokeMock.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd in handlers) return Promise.resolve(handlers[cmd](args));
    // Everything else (community consensus, GOG cover art) defaults to
    // "feature not configured" rather than hanging or throwing.
    return Promise.resolve(null);
  });
}

async function importApp() {
  const { default: App } = await import("./App");
  return App;
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("loads and displays the library on first render", async () => {
    mockInvoke({
      list_games: () => [makeGame({ name: "Braid" }), makeGame({ id: "2", name: "Celeste" })],
      list_providers: () => [{ id: "steam", display_name: "Steam" }],
    });
    const App = await importApp();
    render(<App />);

    expect(await screen.findByText("Braid")).toBeInTheDocument();
    expect(screen.getByText("Celeste")).toBeInTheDocument();
    expect(screen.getByText("2 games across 1 source")).toBeInTheDocument();
  });

  it("shows an error banner when the library scan fails, without crashing", async () => {
    mockInvoke({
      list_games: () => {
        throw new Error("permission denied");
      },
      list_providers: () => [],
    });
    const App = await importApp();
    render(<App />);

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
  });

  it("filters the library as the user types in the search box", async () => {
    const user = userEvent.setup();
    mockInvoke({
      list_games: () => [makeGame({ name: "Braid" }), makeGame({ id: "2", name: "Celeste" })],
      list_providers: () => [{ id: "steam", display_name: "Steam" }],
    });
    const App = await importApp();
    render(<App />);
    await screen.findByText("Braid");

    await user.type(screen.getByPlaceholderText(/search your library/i), "cel");

    expect(screen.queryByText("Braid")).not.toBeInTheDocument();
    expect(screen.getByText("Celeste")).toBeInTheDocument();
  });

  it("shows a Browse Store CTA when no games are installed, and switches tabs when clicked", async () => {
    const user = userEvent.setup();
    mockInvoke({
      list_games: () => [],
      list_providers: () => [],
    });
    const App = await importApp();
    render(<App />);

    const cta = await screen.findByRole("button", { name: /browse the drm-free store/i });
    // Both tabs stay mounted (see App.tsx) so Store's own state
    // survives switching away from it — assert on visibility, not
    // presence in the DOM.
    expect(screen.getByTestId("store-view-stub").parentElement).toHaveAttribute("hidden");

    await user.click(cta);

    expect(screen.getByTestId("store-view-stub").parentElement).not.toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Store" })).toHaveClass("tab-button-active");
  });

  it("launches a game via invoke and shows a launching state while in flight", async () => {
    const user = userEvent.setup();
    let resolveLaunch!: () => void;
    mockInvoke({
      list_games: () => [makeGame({ name: "Braid" })],
      list_providers: () => [{ id: "steam", display_name: "Steam" }],
      launch_game: () =>
        new Promise((resolve) => {
          resolveLaunch = () => resolve(undefined);
        }),
    });
    const App = await importApp();
    render(<App />);
    await screen.findByText("Braid");

    await user.click(screen.getByRole("button", { name: /^play$/i }));
    expect(await screen.findByRole("button", { name: /launching/i })).toBeInTheDocument();

    resolveLaunch();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /launching/i })).not.toBeInTheDocument(),
    );
  });

  it("shows the analytics consent banner until the user chooses, then remembers the choice", async () => {
    const user = userEvent.setup();
    mockInvoke({ list_games: () => [], list_providers: () => [] });
    const App = await importApp();
    render(<App />);

    expect(await screen.findByText(/help improve drm-free launcher/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Allow" }));

    expect(screen.queryByText(/help improve drm-free launcher/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("drmfree-launcher:analytics-consent")).toBe("granted");
  });
});
