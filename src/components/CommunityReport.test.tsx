import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommunityReport } from "./CommunityReport";
import type { Game } from "../types/game";
import type { CommunityConsensus } from "../types/community";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

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

const emptyConsensus: CommunityConsensus = {
  total: 0,
  counts: { "drm-free": 0, drm: 0, unknown: 0 },
  recentNotes: [],
};

describe("CommunityReport freedom-test voting", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("submits status-only reports with no axes payload by default", async () => {
    invokeMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(emptyConsensus);
    const user = userEvent.setup();
    render(<CommunityReport game={makeGame()} consensus={emptyConsensus} onReported={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Report" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "submit_drm_report",
        expect.objectContaining({ axes: null }),
      );
    });
  });

  it("collects votes across the expand-and-select freedom-test flow and submits them", async () => {
    invokeMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(emptyConsensus);
    const user = userEvent.setup();
    render(<CommunityReport game={makeGame()} consensus={emptyConsensus} onReported={() => {}} />);

    await user.click(screen.getByText("Report a freedom test"));
    await user.click(screen.getByRole("group", { name: "Launches offline on first run" }).children[0]);
    await user.click(screen.getByRole("group", { name: "Runs without the storefront client open" }).children[1]);

    await user.click(screen.getByRole("button", { name: "Submit freedom test results" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "submit_drm_report",
        expect.objectContaining({
          axes: { first_launch_offline: "pass", no_storefront_client: "fail" },
        }),
      );
    });
  });

  it("toggles a vote off when the same choice is clicked again", async () => {
    invokeMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CommunityReport game={makeGame()} consensus={emptyConsensus} onReported={() => {}} />);

    await user.click(screen.getByText("Report a freedom test"));
    const passButton = screen.getByRole("group", { name: "Launches offline on first run" })
      .children[0] as HTMLElement;
    await user.click(passButton);
    expect(passButton.className).toContain("freedom-test-vote-active");
    await user.click(passButton);
    expect(passButton.className).not.toContain("freedom-test-vote-active");
  });

  it("disables the freedom-test submit button until at least one axis is voted on", async () => {
    const user = userEvent.setup();
    render(<CommunityReport game={makeGame()} consensus={emptyConsensus} onReported={() => {}} />);

    await user.click(screen.getByText("Report a freedom test"));
    expect(screen.getByRole("button", { name: "Submit freedom test results" })).toBeDisabled();
  });

  it("pre-fills votes and expands the section when a share signal arrives, without submitting anything", () => {
    const { rerender } = render(
      <CommunityReport game={makeGame()} consensus={emptyConsensus} onReported={() => {}} />,
    );
    expect(invokeMock).not.toHaveBeenCalled();

    rerender(
      <CommunityReport
        game={makeGame()}
        consensus={emptyConsensus}
        onReported={() => {}}
        prefillAxisVotes={{ first_launch_offline: "pass" }}
        shareKey={1}
      />,
    );

    const passButton = screen.getByRole("group", { name: "Launches offline on first run" })
      .children[0] as HTMLElement;
    expect(passButton.className).toContain("freedom-test-vote-active");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not re-apply the same prefill twice without a new shareKey", () => {
    const { rerender } = render(
      <CommunityReport
        game={makeGame()}
        consensus={emptyConsensus}
        onReported={() => {}}
        prefillAxisVotes={{ first_launch_offline: "pass" }}
        shareKey={1}
      />,
    );
    const passButton = screen.getByRole("group", { name: "Launches offline on first run" })
      .children[0] as HTMLElement;
    expect(passButton.className).toContain("freedom-test-vote-active");

    // User clears the vote by hand, then the parent re-renders with the
    // exact same shareKey (e.g. an unrelated prop changed) — the
    // useEffect must not re-fire and silently restore what the user
    // just cleared.
    fireEvent.click(passButton);
    expect(passButton.className).not.toContain("freedom-test-vote-active");

    rerender(
      <CommunityReport
        game={makeGame()}
        consensus={emptyConsensus}
        onReported={() => {}}
        prefillAxisVotes={{ first_launch_offline: "pass" }}
        shareKey={1}
      />,
    );
    expect(passButton.className).not.toContain("freedom-test-vote-active");
  });
});
