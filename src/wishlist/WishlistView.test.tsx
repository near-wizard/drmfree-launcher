import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WishlistView } from "./WishlistView";
import type { WishlistGame } from "../types/wishlist";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const VALID_STEAM_ID = "76561197960287930";

function wishlistGame(overrides: Partial<WishlistGame> = {}): WishlistGame {
  return { appid: "1", name: "Risk of Rain", cover_url: null, ...overrides };
}

async function loadWith(games: WishlistGame[], gogResponses: Record<string, unknown> = {}) {
  invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "get_steam_wishlist") return Promise.resolve(games);
    if (cmd === "find_gog_match") {
      const title = args?.title as string;
      return Promise.resolve(gogResponses[title] ?? null);
    }
    return Promise.resolve(null);
  });
  render(<WishlistView />);
  await userEvent.type(screen.getByPlaceholderText("SteamID64 or profile URL"), VALID_STEAM_ID);
  await userEvent.click(screen.getByRole("button", { name: "Load wishlist" }));
}

describe("WishlistView", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("shows an inline error for a vanity URL instead of calling the backend", async () => {
    render(<WishlistView />);
    await userEvent.type(
      screen.getByPlaceholderText("SteamID64 or profile URL"),
      "https://steamcommunity.com/id/near-wizard/",
    );
    await userEvent.click(screen.getByRole("button", { name: "Load wishlist" }));
    expect(await screen.findByText(/doesn't look like a SteamID64/)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("loads and renders wishlist games for a valid SteamID64", async () => {
    await loadWith([wishlistGame({ appid: "1", name: "Risk of Rain" })]);
    expect(invokeMock).toHaveBeenCalledWith("get_steam_wishlist", { steamId: VALID_STEAM_ID });
    expect(await screen.findByText("Risk of Rain")).toBeInTheDocument();
  });

  it("shows an empty state when the wishlist has no public items", async () => {
    await loadWith([]);
    expect(
      await screen.findByText(/No public wishlist items found/),
    ).toBeInTheDocument();
  });

  it("shows a load error banner when the backend call rejects", async () => {
    invokeMock.mockRejectedValue(new Error("network down"));
    render(<WishlistView />);
    await userEvent.type(screen.getByPlaceholderText("SteamID64 or profile URL"), VALID_STEAM_ID);
    await userEvent.click(screen.getByRole("button", { name: "Load wishlist" }));
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });

  it("cross-checks each wishlist title against GOG and shows a found match", async () => {
    await loadWith(
      [wishlistGame({ appid: "1", name: "Risk of Rain" })],
      { "Risk of Rain": { store_url: "https://gog.com/game/risk_of_rain" } },
    );
    expect(await screen.findByRole("button", { name: /Buy DRM-free on GOG/ })).toBeInTheDocument();
  });

  it("shows 'no match' when GOG has nothing for a wishlisted title", async () => {
    await loadWith([wishlistGame({ appid: "1", name: "Risk of Rain" })], {});
    expect(await screen.findByText("No DRM-free match found")).toBeInTheDocument();
  });

  it("opens the compare modal for a found match", async () => {
    await loadWith(
      [wishlistGame({ appid: "1", name: "Risk of Rain" })],
      { "Risk of Rain": { store_url: "https://gog.com/game/risk_of_rain" } },
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Compare" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Steam" })).toBeInTheDocument();
  });

  it("remembers the SteamID64 across loads", async () => {
    await loadWith([]);
    expect(localStorage.getItem("drmfree-launcher:wishlist-steam-id")).toBe(VALID_STEAM_ID);
  });
});
