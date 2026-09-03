import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, DOM from one component test leaks into the next
// (render() doesn't auto-unmount), causing false "multiple elements
// found" failures in later tests within the same file.
afterEach(() => {
  cleanup();
});
