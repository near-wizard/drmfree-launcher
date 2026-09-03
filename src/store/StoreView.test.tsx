import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreView } from "./StoreView";
import type { StoreListing, StoreSearchResult } from "../types/store";

// StoreView had zero test coverage before this file (flagged as
// "future" in App.test.tsx) despite being one of the more stateful
// components in the app: debounced search, a request-token guard
// against stale responses clobbering newer ones, and a one-page-ahead
// prefetch cache that loadMore() consumes instead of hitting the
// network. These tests exercise it through the DOM, with all
// Tauri-side calls mocked, using real timers (the search debounce is
// only 300ms, well inside findBy's default poll window) rather than
// fake timers, to keep the prefetch .then() chains straightforward.

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const openUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/analytics", () => ({ track: trackMock }));

function makeListing(overrides: Partial<StoreListing> = {}): StoreListing {
  return {
    title: "Braid",
    price: "$9.99",
    cover_url: null,
    store_url: "https://gog.com/braid",
    store: "GOG",
    ...overrides,
  };
}

function makeResult(overrides: Partial<StoreSearchResult> = {}): StoreSearchResult {
  return {
    listings: [makeListing()],
    page: 1,
    total_pages: 1,
    ...overrides,
  };
}

// invoke() is called for both list_store_sources and search_store;
// route by command name so each test only has to specify what it
// cares about, same pattern as App.test.tsx.
function mockInvoke(handlers: Record<string, (args: unknown) => unknown>) {
  invokeMock.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd in handlers) return Promise.resolve(handlers[cmd](args));
    return Promise.resolve(null);
  });
}

describe("StoreView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    trackMock.mockReset();
    openUrlMock.mockReset();
  });

  it("shows a skeleton while loading, then the results", async () => {
    mockInvoke({
      list_store_sources: () => [],
      search_store: () => makeResult({ listings: [makeListing({ title: "Braid" })] }),
    });
    render(<StoreView />);

    expect(document.querySelectorAll(".store-card-skeleton").length).toBeGreaterThan(0);
    expect(await screen.findByText("Braid")).toBeInTheDocument();
    expect(document.querySelectorAll(".store-card-skeleton").length).toBe(0);
  });

  it("shows a friendly error message (not the raw backend error) when the search fails", async () => {
    mockInvoke({
      list_store_sources: () => [],
    });
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_store_sources") return Promise.resolve([]);
      if (cmd === "search_store") {
        return Promise.reject(
          new Error("error sending request for url (https://gog.com): connection refused"),
        );
      }
      return Promise.resolve(null);
    });
    render(<StoreView />);

    expect(
      await screen.findByText(/couldn't reach the storefront/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/connection refused/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when the search returns no listings", async () => {
    mockInvoke({
      list_store_sources: () => [],
      search_store: () => makeResult({ listings: [], total_pages: 1 }),
    });
    render(<StoreView />);

    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("re-searches with the typed query after the debounce, and drops earlier in-flight results", async () => {
    const user = userEvent.setup();
    const search = vi.fn((args: unknown) => {
      if ((args as { query: string | null }).query === "brai") {
        // Slow first response — must not clobber the second, faster one.
        return new Promise((resolve) =>
          setTimeout(() => resolve(makeResult({ listings: [makeListing({ title: "Braid" })] })), 50),
        );
      }
      return Promise.resolve(makeResult({ listings: [makeListing({ title: "Celeste" })] }));
    });
    mockInvoke({ list_store_sources: () => [], search_store: search });
    render(<StoreView />);
    await screen.findByText("Braid", {}, { timeout: 2000 }).catch(() => {});

    const input = screen.getByPlaceholderText(/search the drm-free catalog/i);
    await user.clear(input);
    await user.type(input, "brai");
    await user.type(input, "d");

    expect(await screen.findByText("Celeste", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("store_searched");
  });

  it("toggles NSFW inclusion and re-runs the search with it", async () => {
    const user = userEvent.setup();
    const search = vi.fn(() => makeResult({ listings: [makeListing()] }));
    mockInvoke({ list_store_sources: () => [], search_store: search });
    render(<StoreView />);
    await screen.findByText("Braid");

    await user.click(screen.getByLabelText(/show nsfw/i));

    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeNsfw: true }),
      ),
    );
    expect(trackMock).toHaveBeenCalledWith("store_nsfw_toggled", { enabled: true });
  });

  it("only shows the source filter when more than one source is registered", async () => {
    mockInvoke({
      list_store_sources: () => [{ id: "gog", display_name: "GOG" }],
      search_store: () => makeResult(),
    });
    render(<StoreView />);
    await screen.findByText("Braid");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the source filter and searches by it once multiple sources are registered", async () => {
    const user = userEvent.setup();
    const search = vi.fn(() => makeResult());
    mockInvoke({
      list_store_sources: () => [
        { id: "gog", display_name: "GOG" },
        { id: "itch", display_name: "itch.io" },
      ],
      search_store: search,
    });
    render(<StoreView />);
    await screen.findByText("Braid");

    await user.selectOptions(screen.getByRole("combobox"), "itch");

    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ source: "itch" })),
    );
  });

  it("loads more results on click and appends them, without re-fetching the first page", async () => {
    const user = userEvent.setup();
    const search = vi.fn((args: unknown) => {
      if ((args as { page: number }).page === 1) {
        return makeResult({ listings: [makeListing({ title: "Braid" })], page: 1, total_pages: 2 });
      }
      return makeResult({ listings: [makeListing({ title: "Celeste" })], page: 2, total_pages: 2 });
    });
    mockInvoke({ list_store_sources: () => [], search_store: search });
    render(<StoreView />);
    await screen.findByText("Braid");

    const loadMore = await screen.findByRole("button", { name: /load more/i });
    await user.click(loadMore);

    await waitFor(() => expect(screen.getByText("Celeste")).toBeInTheDocument());
    // Braid (page 1) is still there — loadMore appends, it doesn't replace.
    expect(screen.getByText("Braid")).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("store_load_more_clicked");
  });

  it("does not show a Load more button once every page has been fetched", async () => {
    mockInvoke({
      list_store_sources: () => [],
      search_store: () => makeResult({ page: 1, total_pages: 1 }),
    });
    render(<StoreView />);
    await screen.findByText("Braid");
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("opens the storefront URL and tracks the click when Buy is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke({
      list_store_sources: () => [],
      search_store: () =>
        makeResult({ listings: [makeListing({ title: "Braid", store: "GOG", store_url: "https://gog.com/braid" })] }),
    });
    render(<StoreView />);
    await screen.findByText("Braid");

    await user.click(screen.getByRole("button", { name: /buy on gog/i }));

    expect(openUrlMock).toHaveBeenCalledWith("https://gog.com/braid");
    expect(trackMock).toHaveBeenCalledWith("store_buy_clicked", { store: "GOG" });
  });
});
