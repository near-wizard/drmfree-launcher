import { useState, type FormEvent } from "react";

interface AddManualGameFormProps {
  onAdd: (input: { name: string; exePath: string; installDir: string }) => void;
  onCancel: () => void;
}

// Name-only submission is deliberately allowed — decision 0002's
// non-invasive spirit extends here too: a game with no exePath just
// can't be launched from this card yet (GameCard disables Play and
// explains why), but it still counts toward the freedom dashboard and
// library stats, which is the actual point for someone who mainly
// wants an accurate record of what they own DRM-free.
export function AddManualGameForm({ onAdd, onCancel }: AddManualGameFormProps) {
  const [name, setName] = useState("");
  const [exePath, setExePath] = useState("");
  const [installDir, setInstallDir] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Give it a name.");
      return;
    }
    onAdd({ name, exePath, installDir });
  }

  return (
    <form className="manual-game-form" onSubmit={onSubmit}>
      <p className="store-disclosure">
        For DRM-free games this app can't detect automatically (itch.io purchases, for
        instance) — this stays entirely on your machine, never submitted anywhere.
      </p>
      <div className="manual-game-form-row">
        <input
          type="text"
          className="search-input"
          placeholder="Game name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          autoFocus
        />
      </div>
      <div className="manual-game-form-row">
        <input
          type="text"
          className="search-input"
          placeholder="Executable path (optional — needed to launch from here)"
          value={exePath}
          onChange={(e) => setExePath(e.currentTarget.value)}
        />
      </div>
      <div className="manual-game-form-row">
        <input
          type="text"
          className="search-input"
          placeholder="Install folder (optional)"
          value={installDir}
          onChange={(e) => setInstallDir(e.currentTarget.value)}
        />
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="manual-game-form-actions">
        <button type="submit">Add game</button>
        <button type="button" className="manual-game-form-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
