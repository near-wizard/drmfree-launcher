import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareDealModal } from "./CompareDealModal";

const openUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

// A fresh id per call rather than one fixed default — CompareDealModal
// caches Steam prices module-wide by id (same pattern as
// gogCoverArtCache elsewhere), so reusing one id across tests would
// let an earlier test's cached price leak into a later one instead of
// that test's own mock being honored.
let nextGameId = 1;
function renderModal(overrides: Partial<React.ComponentProps<typeof CompareDealModal>> = {}) {
  return render(
    <CompareDealModal
      gameName="Risk of Rain"
      lockedProviderId="steam"
      lockedProviderLabel="Steam"
      lockedGameId={String(nextGameId++)}
      gogStoreUrl="https://gog.com/game/risk_of_rain"
      gogPrice={null}
      onClose={() => {}}
      {...overrides}
    />,
  );
}

describe("CompareDealModal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
  });

  it("shows the game name and a comparison for the locked provider", () => {
    renderModal();
    expect(screen.getByText("Risk of Rain")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Steam" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GOG (DRM-free)" })).toBeInTheDocument();
    expect(screen.getByText(/Valve can revoke/)).toBeInTheDocument();
  });

  it("falls back to generic traits for a provider with no specific copy", () => {
    renderModal({ lockedProviderId: "unknown-provider", lockedProviderLabel: "Unknown Provider" });
    expect(screen.getByText("A revocable license, not a copy you own")).toBeInTheDocument();
  });

  it("calls onClose when the overlay is clicked", async () => {
    // Portaled to document.body (see CompareDealModal.tsx) — not a
    // descendant of RTL's own render container, so query the document
    // directly rather than the container returned by render().
    const onClose = vi.fn();
    renderModal({ onClose });
    const overlay = document.querySelector(".compare-deal-overlay")!;
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel itself", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByText("Risk of Rain"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the GOG store URL when the buy button is clicked", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: /Buy DRM-free on GOG/ }));
    expect(openUrlMock).toHaveBeenCalledWith("https://gog.com/game/risk_of_rain");
  });

  it("fetches the Steam price for the locked side when the provider is steam", async () => {
    invokeMock.mockResolvedValue("$59.99");
    renderModal({ gogPrice: "$39.99", lockedGameId: "555" });
    expect(await screen.findByText("$59.99")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("get_steam_price", { id: "555" });
  });

  it("does not fetch a price for a non-steam provider", () => {
    renderModal({ lockedProviderId: "epic", lockedProviderLabel: "Epic Games" });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Price unknown").length).toBeGreaterThan(0);
  });

  it("shows a savings figure when the GOG price is cheaper", async () => {
    invokeMock.mockResolvedValue("$59.99");
    renderModal({ gogPrice: "$39.99" });
    await waitFor(() => expect(screen.getByText("$59.99")).toBeInTheDocument());
    expect(screen.getByText("Save $20.00 buying DRM-free on GOG")).toBeInTheDocument();
  });

  it("shows a 'more on GOG' figure when the GOG price is higher", async () => {
    invokeMock.mockResolvedValue("$9.99");
    renderModal({ gogPrice: "$19.99" });
    await waitFor(() => expect(screen.getByText("$9.99")).toBeInTheDocument());
    expect(screen.getByText("$10.00 more on GOG")).toBeInTheDocument();
  });

  it("shows no savings figure when either price is unknown", () => {
    renderModal({ gogPrice: null, lockedProviderId: "epic" });
    expect(screen.queryByText(/Save \$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/more on GOG/)).not.toBeInTheDocument();
  });
});
