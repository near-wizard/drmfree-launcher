import type { ReactElement } from "react";
import { ModManagerPlugin } from "./mods/ModManagerPlugin";

// One entry per plugin id from the backend registry (plugins.rs's
// PLUGINS) — a plugin window has nowhere else to look this up from,
// since it never mounts <App /> or any of the main app's routing.
const PLUGIN_COMPONENTS: Record<string, () => ReactElement> = {
  mods: ModManagerPlugin,
};

export function PluginWindow({ pluginId }: { pluginId: string }) {
  const Component = PLUGIN_COMPONENTS[pluginId];
  if (!Component) {
    return (
      <main className="container plugin-window">
        <p className="error-banner">Unknown plugin: {pluginId}</p>
      </main>
    );
  }
  return <Component />;
}
