import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameList } from "./components/GameList";
import { StoreView } from "./store/StoreView";
import { loadLastPlayedMap, recordLaunch } from "./lib/lastPlayed";
import type { DrmStatus, Game } from "./types/game";
import type { ProviderInfo } from "./types/provider";
import "./App.css";

type Tab = "library" | "store";
type SortBy = "name" | "provider" | "recent";

function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [games, setGames] = useState<Game[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [drmFilter, setDrmFilter] = useState<DrmStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [lastPlayed, setLastPlayed] = useState<Record<string, number>>(() => loadLastPlayedMap());
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Game[]>("list_games");
      setGames(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    invoke<ProviderInfo[]>("list_providers").then((providers) => {
      setProviderLabels(Object.fromEntries(providers.map((p) => [p.id, p.display_name])));
    });
    refresh();
  }, []);

  // "/" focuses the search box from anywhere (unless already typing
  // somewhere else); Escape clears and blurs it when it has focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tab !== "library") return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && target === searchInputRef.current) {
        setQuery("");
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab]);

  async function launch(game: Game) {
    setLaunchingId(game.id);
    setError(null);
    try {
      await invoke("launch_game", { provider: game.provider, id: game.id });
      recordLaunch(game.provider, game.id);
      setLastPlayed(loadLastPlayedMap());
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunchingId(null);
    }
  }

  const availableProviders = useMemo(
    () => Array.from(new Set(games.map((g) => g.provider))).sort(),
    [games],
  );

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = games
      .filter((g) => providerFilter === "all" || g.provider === providerFilter)
      .filter((g) => drmFilter === "all" || g.drm.status === drmFilter)
      .filter((g) => q === "" || g.name.toLowerCase().includes(q));

    switch (sortBy) {
      case "provider":
        return filtered.sort(
          (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
        );
      case "recent":
        return filtered.sort((a, b) => {
          const aPlayed = lastPlayed[`${a.provider}:${a.id}`] ?? 0;
          const bPlayed = lastPlayed[`${b.provider}:${b.id}`] ?? 0;
          return bPlayed - aPlayed || a.name.localeCompare(b.name);
        });
      case "name":
      default:
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [games, query, providerFilter, drmFilter, sortBy, lastPlayed]);

  // Enter-to-launch from the search box targets the top visible result —
  // there's no per-card keyboard focus model, so this is the "quick
  // launch" shortcut rather than full list navigation.
  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const top = visibleGames[0];
    if (top && launchingId === null) launch(top);
  }

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>{tab === "library" ? "Your Library" : "Store"}</h1>
          {tab === "library" && games.length > 0 && (
            <p className="header-subtitle">
              {games.length} game{games.length === 1 ? "" : "s"} across{" "}
              {availableProviders.length} source{availableProviders.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {tab === "library" && (
          <button onClick={refresh} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Scanning..." : "Rescan"}
          </button>
        )}
      </header>

      <nav className="tab-bar">
        <button
          className={`tab-button ${tab === "library" ? "tab-button-active" : ""}`}
          onClick={() => setTab("library")}
        >
          Library
        </button>
        <button
          className={`tab-button ${tab === "store" ? "tab-button-active" : ""}`}
          onClick={() => setTab("store")}
        >
          Store
        </button>
      </nav>

      {/* Both tabs stay mounted (hidden via CSS, not unmounted) so the
          Store tab's search/pagination state survives switching to
          Library and back. */}
      <div hidden={tab !== "library"}>
        {games.length > 0 && (
          <div className="library-controls">
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search your library... (/)"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
            />
            <select
              className="provider-filter"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.currentTarget.value)}
            >
              <option value="all">All sources ({games.length})</option>
              {availableProviders.map((p) => (
                <option key={p} value={p}>
                  {(providerLabels[p] ?? p) +
                    ` (${games.filter((g) => g.provider === p).length})`}
                </option>
              ))}
            </select>
            <select
              className="provider-filter"
              value={drmFilter}
              onChange={(e) => setDrmFilter(e.currentTarget.value as DrmStatus | "all")}
              aria-label="Filter library by DRM status"
            >
              <option value="all">All DRM statuses ({games.length})</option>
              <option value="drm-free">
                DRM-Free ({games.filter((g) => g.drm.status === "drm-free").length})
              </option>
              <option value="drm">DRM ({games.filter((g) => g.drm.status === "drm").length})</option>
              <option value="unknown">
                DRM Unknown ({games.filter((g) => g.drm.status === "unknown").length})
              </option>
            </select>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.currentTarget.value as SortBy)}
              aria-label="Sort library by"
            >
              <option value="name">Sort: Name</option>
              <option value="recent">Sort: Recently played</option>
              <option value="provider">Sort: Source</option>
            </select>
          </div>
        )}

        {error && <p className="error-banner">{error}</p>}
        <GameList
          games={visibleGames}
          onLaunch={launch}
          launchingId={launchingId}
          providerLabels={providerLabels}
          hasAnyGames={games.length > 0}
          loading={loading}
        />
      </div>
      <div hidden={tab !== "store"}>
        <StoreView />
      </div>
    </main>
  );
}

export default App;
