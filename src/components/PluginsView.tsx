import { useEffect, useState } from "react";
import { isPluginEnabled, listPlugins, openPluginWindow, setPluginEnabled, type PluginInfo } from "../lib/plugins";
import { track } from "../lib/analytics";

// Every plugin is off by default (decision 0029) — this view is the only
// place that turns one on, and it never does so on its own; enabling and
// opening are both explicit clicks.
export function PluginsView() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlugins()
      .then((result) => {
        // Defensive, not expected in a real build: an unmocked invoke()
        // in tests (and any future "feature not configured" backend)
        // can resolve non-plugin commands to null — treat that the same
        // as "no plugins" rather than crashing the whole tab.
        const list = Array.isArray(result) ? result : [];
        setPlugins(list);
        setEnabled(Object.fromEntries(list.map((p) => [p.id, isPluginEnabled(p.id)])));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function onToggle(id: string, next: boolean) {
    setPluginEnabled(id, next);
    setEnabled((prev) => ({ ...prev, [id]: next }));
    track("plugin_toggled", { plugin: id, enabled: next });
  }

  async function onOpen(id: string) {
    setError(null);
    track("plugin_window_opened", { plugin: id });
    try {
      await openPluginWindow(id);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="plugins-view">
      <p className="header-subtitle">
        Optional modules, off by default. Enabling a window plugin only unlocks its own window
        and its own narrow set of commands; enabling a feature-flag plugin only reveals UI
        that's already in the main window — neither changes what the app itself can do. See{" "}
        <code>docs/decisions/0029</code> and <code>0030</code> for the design.
      </p>
      {error && <p className="error-banner">{error}</p>}
      {!loading && plugins.length === 0 && <p>No plugins registered yet.</p>}
      <ul className="plugin-list">
        {plugins.map((p) => (
          <li key={p.id} className="plugin-card">
            <div className="plugin-card-info">
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              {!p.has_window && (
                <p className="plugin-inline-location">Appears inline on each game card in your Library.</p>
              )}
            </div>
            <div className="plugin-card-actions">
              <label className="plugin-toggle">
                <input
                  type="checkbox"
                  checked={enabled[p.id] ?? false}
                  onChange={(e) => onToggle(p.id, e.currentTarget.checked)}
                />
                Enabled
              </label>
              {p.has_window && (
                <button disabled={!enabled[p.id]} onClick={() => onOpen(p.id)}>
                  Open
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
