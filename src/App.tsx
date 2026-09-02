import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameList } from "./components/GameList";
import type { Game } from "./types/game";
import "./App.css";

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="container">
      <header className="app-header">
        <h1>Your Library</h1>
        <button onClick={refresh} disabled={loading}>
          {loading ? "Scanning..." : "Rescan"}
        </button>
      </header>
      {error && <p className="error-banner">{error}</p>}
      <GameList games={games} onLaunch={launch} launchingId={launchingId} />
    </main>
  );
}

export default App;
