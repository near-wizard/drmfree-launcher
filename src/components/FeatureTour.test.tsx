import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeatureTour, type TourStep } from "./FeatureTour";
import type { Tab } from "../lib/lastTab";

// FeatureTour spotlights real elements via document.querySelector, not
// anything rendered by the test itself — so each test plants a plain
// DOM node with the matching data-tour attribute directly, the same
// way the real target elements exist elsewhere in the live app.
// Cleanup is left to Testing Library's own automatic afterEach
// (registered globally) rather than manually clearing document.body:
// FeatureTour portals into document.body, and wiping it by hand races
// React's own unmount there.
function plantTarget(id: string) {
  const el = document.createElement("button");
  el.setAttribute("data-tour", id);
  el.getBoundingClientRect = () => ({
    top: 100, left: 50, width: 120, height: 30, bottom: 130, right: 170, x: 50, y: 100, toJSON() {},
  });
  document.body.appendChild(el);
}

const oneStep: TourStep[] = [
  { id: "a", tab: "library", selector: '[data-tour="a"]', title: "Step A", body: "Body A" },
];

const twoSteps: TourStep[] = [
  { id: "a", tab: "library", selector: '[data-tour="a"]', title: "Step A", body: "Body A" },
  { id: "b", tab: "wishlist", selector: '[data-tour="b"]', title: "Step B", body: "Body B" },
];

// Mirrors how App.tsx actually uses FeatureTour — currentTab is real
// state that onChangeTab updates, not a fixed prop — so tests exercise
// the same tab-switch round trip the live app does, not a stub.
function Harness({ steps, initialTab = "library" as Tab, onDone = () => {} }: { steps: TourStep[]; initialTab?: Tab; onDone?: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return <FeatureTour steps={steps} currentTab={tab} onChangeTab={setTab} onDone={onDone} />;
}

// Only removes the plain elements plantTarget() adds directly to
// document.body — never touches anything React/Testing-Library
// manages there (FeatureTour's own portal included), so this can't
// race with RTL's automatic cleanup the way clearing body.innerHTML
// wholesale would.
afterEach(() => {
  document.querySelectorAll("[data-tour]").forEach((el) => el.remove());
});

describe("FeatureTour", () => {
  it("switches to the step's own tab if the app isn't already there", async () => {
    plantTarget("b");
    render(<Harness steps={twoSteps.slice(1)} initialTab="library" />);
    expect(await screen.findByText("Step B")).toBeInTheDocument();
  });

  it("spotlights the real target once its tab is current", async () => {
    plantTarget("a");
    render(<Harness steps={oneStep} />);
    expect(await screen.findByText("Step A")).toBeInTheDocument();
    expect(screen.getByText("Body A")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("auto-advances past a step whose target doesn't exist in the current library state", async () => {
    // Deliberately no target planted for "a" — simulates an empty
    // library skipping the freedom-dashboard step, for example.
    plantTarget("b");
    render(<Harness steps={twoSteps} />);
    expect(await screen.findByText("Step B")).toBeInTheDocument();
  });

  it("shows 'Done' on the last step and calls onDone when clicked", async () => {
    plantTarget("a");
    const onDone = vi.fn();
    render(<Harness steps={oneStep} onDone={onDone} />);
    const button = await screen.findByRole("button", { name: "Done" });
    await userEvent.click(button);
    expect(onDone).toHaveBeenCalled();
  });

  it("advances from Next through multiple steps, switching tabs along the way", async () => {
    plantTarget("a");
    plantTarget("b");
    render(<Harness steps={twoSteps} />);
    expect(await screen.findByText("Step A")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Step B")).toBeInTheDocument();
  });

  it("calls onDone when skipped", async () => {
    plantTarget("a");
    const onDone = vi.fn();
    render(<Harness steps={oneStep} onDone={onDone} />);
    await screen.findByText("Step A");
    await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("renders nothing when given an empty step list", () => {
    const { container } = render(<Harness steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
