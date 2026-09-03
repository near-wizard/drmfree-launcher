import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareDealModal } from "./CompareDealModal";

const openUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

describe("CompareDealModal", () => {
  it("shows the game name and a comparison for the locked provider", () => {
    render(
      <CompareDealModal
        gameName="Risk of Rain"
        lockedProviderId="steam"
        lockedProviderLabel="Steam"
        gogStoreUrl="https://gog.com/game/risk_of_rain"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Risk of Rain")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Steam" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GOG (DRM-free)" })).toBeInTheDocument();
    expect(screen.getByText(/Valve can revoke/)).toBeInTheDocument();
  });

  it("falls back to generic traits for a provider with no specific copy", () => {
    render(
      <CompareDealModal
        gameName="Some Game"
        lockedProviderId="unknown-provider"
        lockedProviderLabel="Unknown Provider"
        gogStoreUrl="https://gog.com/game/x"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("A revocable license, not a copy you own")).toBeInTheDocument();
  });

  it("calls onClose when the overlay is clicked", async () => {
    // Portaled to document.body (see CompareDealModal.tsx) — not a
    // descendant of RTL's own render container, so query the document
    // directly rather than the container returned by render().
    const onClose = vi.fn();
    render(
      <CompareDealModal
        gameName="Risk of Rain"
        lockedProviderId="steam"
        lockedProviderLabel="Steam"
        gogStoreUrl="https://gog.com/game/risk_of_rain"
        onClose={onClose}
      />,
    );
    const overlay = document.querySelector(".compare-deal-overlay")!;
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel itself", async () => {
    const onClose = vi.fn();
    render(
      <CompareDealModal
        gameName="Risk of Rain"
        lockedProviderId="steam"
        lockedProviderLabel="Steam"
        gogStoreUrl="https://gog.com/game/risk_of_rain"
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByText("Risk of Rain"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the GOG store URL when the buy button is clicked", async () => {
    render(
      <CompareDealModal
        gameName="Risk of Rain"
        lockedProviderId="steam"
        lockedProviderLabel="Steam"
        gogStoreUrl="https://gog.com/game/risk_of_rain"
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Buy DRM-free on GOG/ }));
    expect(openUrlMock).toHaveBeenCalledWith("https://gog.com/game/risk_of_rain");
  });
});
