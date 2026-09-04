// Placeholder root for the "Mod Manager" plugin window (decision 0029).
// This window has no real mod commands to call yet — it exists to prove
// out the scaffold (its own window, its own narrower capability file:
// src-tauri/capabilities/plugin-mods.json) before decision 0028's
// still-open phasing question (local-only vs. install-from-URL vs. a
// curated catalog) picks what this actually does.
export function ModManagerPlugin() {
  return (
    <main className="container plugin-window">
      <h1>Mod Manager</h1>
      <p className="header-subtitle">
        This is a separate, opt-in plugin window — not a tab in the main app. It runs with its
        own capability grant (no opener, updater, or process access), and today it has no
        mod-management commands wired up yet. See <code>docs/decisions/0028</code> and{" "}
        <code>0029</code> in the launcher repo for what's planned and why nothing installs
        anything yet.
      </p>
    </main>
  );
}
