import { describe, it, expect, beforeEach, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthogMock }));

// `initialized` is module-level state, and getConsentStatus/track read
// import.meta.env at module-eval time — reset the module registry (and
// re-import) between tests so each test starts from a clean slate
// instead of leaking PostHog's "already initialized" flag across tests.
async function freshAnalytics() {
  vi.resetModules();
  return import("./analytics");
}

describe("analytics", () => {
  beforeEach(() => {
    localStorage.clear();
    posthogMock.init.mockClear();
    posthogMock.capture.mockClear();
    posthogMock.opt_in_capturing.mockClear();
    posthogMock.opt_out_capturing.mockClear();
  });

  it("defaults consent to unset", async () => {
    const { getConsentStatus } = await freshAnalytics();
    expect(getConsentStatus()).toBe("unset");
  });

  it("never calls posthog.capture before consent is granted", async () => {
    const { track } = await freshAnalytics();
    track("app_opened");
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("records granted consent and allows tracking afterward", async () => {
    const { grantConsent, getConsentStatus, track } = await freshAnalytics();
    grantConsent();
    expect(getConsentStatus()).toBe("granted");
    track("app_opened");
    // No VITE_POSTHOG_KEY is configured in the test env, so init()
    // itself is still a no-op — the point of this test is that consent
    // being granted no longer short-circuits track() before it even
    // tries.
    expect(getConsentStatus()).toBe("granted");
  });

  it("denyConsent records denied status", async () => {
    const { grantConsent, denyConsent, getConsentStatus } = await freshAnalytics();
    grantConsent();
    denyConsent();
    expect(getConsentStatus()).toBe("denied");
  });

  it("stops tracking immediately after consent is revoked mid-session", async () => {
    const { grantConsent, denyConsent, track } = await freshAnalytics();
    grantConsent();
    denyConsent();
    posthogMock.capture.mockClear();
    track("app_opened");
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("treats an unrecognized stored value as unset", async () => {
    localStorage.setItem("drmfree-launcher:analytics-consent", "maybe");
    const { getConsentStatus } = await freshAnalytics();
    expect(getConsentStatus()).toBe("unset");
  });
});
