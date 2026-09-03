import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

const openUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));

function Bomb(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    openUrlMock.mockReset();
    // React logs the caught error to the console on top of
    // componentDidCatch's own console.error; silence both so the test
    // output isn't dominated by an intentionally-thrown error.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a render error and shows the fallback instead of a blank page", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("lets the user retry, re-rendering children on the next attempt", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("kaboom");
      return <p>Recovered</p>;
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    rerender(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("opens a pre-filled issue report when 'Report this' is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: /report this/i }));

    expect(openUrlMock).toHaveBeenCalledWith(
      expect.stringContaining("github.com/near-wizard/drmfree-launcher/issues/new"),
    );
  });
});
