import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PluginWindow } from "./plugins/PluginWindow";

// Plugin windows (decision 0027) load this same built SPA, distinguished
// only by a `?plugin=<id>` query param the backend sets when it opens
// the window (see src-tauri/src/plugins.rs) — so a plugin window mounts
// its own root here and never constructs <App />, rather than reusing
// the main app's UI with some part of it hidden.
const pluginId = new URLSearchParams(window.location.search).get("plugin");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{pluginId ? <PluginWindow pluginId={pluginId} /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
