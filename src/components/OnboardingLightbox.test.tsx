import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingLightbox } from "./OnboardingLightbox";
import { loadOnboardingPlatforms } from "../lib/onboarding";

describe("OnboardingLightbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts on the welcome step", () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    expect(screen.getByText("Welcome to DRM-Free Launcher")).toBeInTheDocument();
  });

  it("calls onDone when skipped mid-tour", async () => {
    const onDone = vi.fn();
    render(<OnboardingLightbox onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // step 0 has no skip button
    await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("has no skip button on the first step", () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "Skip tour" })).not.toBeInTheDocument();
  });

  it("persists the platform selection and shows both tailored bullets when nothing is deselected", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> platform step
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> feature step, nothing selected
    expect(screen.getByText(/Checks your Steam wishlist/)).toBeInTheDocument();
    expect(screen.getByText(/Lets you add DRM-free games/)).toBeInTheDocument();
  });

  it("hides both tailored bullets when a selection excludes their triggers", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> platform step
    await userEvent.click(screen.getByLabelText("GOG")); // neither steam nor "other"
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> feature step
    expect(screen.queryByText(/Checks your Steam wishlist/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lets you add DRM-free games/)).not.toBeInTheDocument();
  });

  it("hides the manual-entry bullet unless 'somewhere else' is selected", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> platform step
    await userEvent.click(screen.getByLabelText("Steam"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" })); // -> feature step
    expect(screen.getByText(/Checks your Steam wishlist/)).toBeInTheDocument();
    expect(screen.queryByText(/Lets you add DRM-free games/)).not.toBeInTheDocument();
  });

  it("saves the platform selection so it survives re-opening the tour", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByLabelText("Epic Games"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(loadOnboardingPlatforms()).toEqual(["epic"]);
  });

  it("calls onDone from the final step's Let's go button", async () => {
    const onDone = vi.fn();
    render(<OnboardingLightbox onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Let's go" }));
    expect(onDone).toHaveBeenCalled();
  });
});
