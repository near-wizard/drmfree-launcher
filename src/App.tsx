import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameList } from "./components/GameList";
import type { Game } from "./types/game";
import type { ProviderInfo } from "./types/provider";
import "./App.css";

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");

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

  async function launch(game: Game) {
    setLaunchingId(game.id);
    setError(null);
    try {
      await invoke("launch_game", { provider: game.provider, id: game.id });
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
    return games
      .filter((g) => providerFilter === "all" || g.provider === providerFilter)
      .filter((g) => q === "" || g.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [games, query, providerFilter]);

  return (
    <main className="container">
      <header className="app-header">
        <h1>Your Library</h1>
        <button onClick={refresh} disabled={loading}>
          {loading ? "Scanning..." : "Rescan"}
        </button>
      </header>

      {games.length > 0 && (
        <div className="library-controls">
          <input
            type="text"
            className="search-input"
            placeholder="Search your library..."
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
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
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}
      <GameList
        games={visibleGames}
        onLaunch={launch}
        launchingId={launchingId}
        providerLabels={providerLabels}
        hasAnyGames={games.length > 0}
      />
    </main>
  );
}

export default App;
