import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../../types/game";
import {
  getChosenModsDir,
  listMods,
  setChosenModsDir,
  setModOrder,
  suggestModDirs,
  toggleMod,
  type ModEntry,
} from "../../lib/mods";

// Real UI for the Mod Manager plugin window (decision 0029), Phase A
// only (decision 0028 option A, this shape decided in decision 0032):
// pick one of your installed games, point at that game's mods folder
// yourself (this app has no per-game mod-directory convention
// database — see decision 0032), then list/enable/disable/reorder
// whatever's already sitting there. No fetching, no archives, no
// execution — every action here reads or renames a file the user
// already had.
export function ModManagerPlugin() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [selectedGameKey, setSelectedGameKey] = useState<string>("");
  const [dir, setDir] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mods, setMods] = useState<ModEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busyRawName, setBusyRawName] = useState<string | null>(null);

  useEffect(() => {
    invoke<Game[]>("list_games")
      .then(setGames)
      .catch((e) => setGamesError(String(e)));
  }, []);

  const selectedGame = useMemo(
    () => games?.find((g) => `${g.provider}:${g.id}` === selectedGameKey) ?? null,
    [games, selectedGameKey],
  );

  // Selecting a game seeds the folder field from whatever was chosen
  // last time (if any) and refreshes the small conventional-subfolder
  // suggestion list — neither one auto-applies anything.
  useEffect(() => {
    if (!selectedGame) {
      setDir("");
      setSuggestions([]);
      setMods(null);
      return;
    }
    const remembered = getChosenModsDir(selectedGame.provider, selectedGame.id);
    setDir(remembered ?? "");
    setMods(null);
    setListError(null);
    if (selectedGame.install_dir) {
      suggestModDirs(selectedGame.install_dir)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
  }, [selectedGame]);

  async function refreshMods(targetDir: string) {
    if (targetDir.trim() === "") {
      setMods(null);
      return;
    }
    try {
      const entries = await listMods(targetDir);
      setMods(entries);
      setListError(null);
    } catch (e) {
      setMods(null);
      setListError(String(e));
    }
  }

  function onUseDir(candidate: string) {
    setDir(candidate);
    if (selectedGame) {
      setChosenModsDir(selectedGame.provider, selectedGame.id, candidate);
    }
    void refreshMods(candidate);
  }

  async function onToggle(entry: ModEntry) {
    if (!dir) return;
    setBusyRawName(entry.raw_name);
    try {
      await toggleMod(dir, entry.raw_name, !entry.enabled);
      await refreshMods(dir);
    } catch (e) {
      setListError(String(e));
    } finally {
      setBusyRawName(null);
    }
  }

  async function onMove(index: number, direction: -1 | 1) {
    if (!mods) return;
    const target = index + direction;
    if (target < 0 || target >= mods.length) return;
    const reordered = [...mods];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMods(reordered);
    try {
      await setModOrder(
        dir,
        reordered.map((m) => m.name),
      );
    } catch (e) {
      setListError(String(e));
      await refreshMods(dir);
    }
  }

  return (
    <main className="container plugin-window mod-manager">
      <h1>Mod Manager</h1>
      <p className="header-subtitle">
        Local-only mod management (decision 0028, phase A): pick a game, point at its mods
        folder, and enable/disable/reorder what's already there. This never downloads, extracts,
        or runs anything — see <code>docs/decisions/0032</code> for exactly what it does and
        doesn't do.
      </p>

      {gamesError && <p className="error-banner">Couldn't load your library: {gamesError}</p>}

      <div className="mod-manager-row">
        <label htmlFor="mod-manager-game-select">Game</label>
        <select
          id="mod-manager-game-select"
          className="provider-filter"
          value={selectedGameKey}
          onChange={(e) => setSelectedGameKey(e.currentTarget.value)}
        >
          <option value="">Select a game…</option>
          {games?.map((g) => (
            <option key={`${g.provider}:${g.id}`} value={`${g.provider}:${g.id}`}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {selectedGame && (
        <>
          <div className="mod-manager-row">
            <label htmlFor="mod-manager-dir-input">Mods folder</label>
            <input
              id="mod-manager-dir-input"
              type="text"
              className="search-input"
              placeholder="Paste or type the full path to this game's mods folder"
              value={dir}
              onChange={(e) => setDir(e.currentTarget.value)}
            />
            <button type="button" onClick={() => onUseDir(dir)} disabled={dir.trim() === ""}>
              Use this folder
            </button>
          </div>

          {suggestions.length > 0 && (
            <p className="mod-manager-suggestions">
              Found: {suggestions.map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <button type="button" className="mod-manager-suggestion-btn" onClick={() => onUseDir(s)}>
                    {s}
                  </button>
                </span>
              ))}
            </p>
          )}

          {listError && <p className="error-banner">{listError}</p>}

          {mods && (
            <>
              {mods.length === 0 ? (
                <p className="header-subtitle">No files or folders found in this directory.</p>
              ) : (
                <>
                  <ul className="mod-manager-list">
                    {mods.map((entry, index) => (
                      <li key={entry.raw_name} className="mod-manager-item">
                        <div className="mod-manager-order-btns">
                          <button
                            type="button"
                            aria-label={`Move ${entry.name} up`}
                            disabled={index === 0}
                            onClick={() => onMove(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${entry.name} down`}
                            disabled={index === mods.length - 1}
                            onClick={() => onMove(index, 1)}
                          >
                            ↓
                          </button>
                        </div>
                        <span className="mod-manager-name">
                          {entry.name}
                          {entry.is_dir ? " /" : ""}
                        </span>
                        <label className="mod-manager-toggle">
                          <input
                            type="checkbox"
                            checked={entry.enabled}
                            disabled={busyRawName === entry.raw_name}
                            onChange={() => onToggle(entry)}
                          />
                          {entry.enabled ? "Enabled" : "Disabled"}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mod-manager-order-note">
                    The order above is bookkeeping only — for a generic tool like this, it isn't
                    read by the game itself. It just keeps your list arranged the way you left it.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
