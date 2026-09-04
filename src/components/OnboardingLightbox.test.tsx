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

  it("has no skip button on the first step", () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "Skip tour" })).not.toBeInTheDocument();
  });

  it("advances to the platform question", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("How do you get your games?")).toBeInTheDocument();
  });

  it("calls onDone when skipped mid-tour", async () => {
    const onDone = vi.fn();
    render(<OnboardingLightbox onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("saves the platform selection and calls onDone from 'Start tour'", async () => {
    const onDone = vi.fn();
    render(<OnboardingLightbox onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByLabelText("Epic Games"));
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start tour" }));
    expect(onDone).toHaveBeenCalled();
    expect(loadOnboardingPlatforms()).toEqual(["epic"]);
  });

  it("saves an empty selection when nothing is checked", async () => {
    render(<OnboardingLightbox onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Start tour" }));
    expect(loadOnboardingPlatforms()).toEqual([]);
  });
});
