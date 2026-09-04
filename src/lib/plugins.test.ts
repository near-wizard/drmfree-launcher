import { describe, it, expect, beforeEach, vi } from "vitest";
import { isPluginEnabled, listPlugins, openPluginWindow, setPluginEnabled } from "./plugins";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("plugins", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("every plugin starts disabled", () => {
    expect(isPluginEnabled("mods")).toBe(false);
  });

  it("setPluginEnabled(true) persists across isPluginEnabled calls", () => {
    setPluginEnabled("mods", true);
    expect(isPluginEnabled("mods")).toBe(true);
  });

  it("setPluginEnabled(false) turns it back off", () => {
    setPluginEnabled("mods", true);
    setPluginEnabled("mods", false);
    expect(isPluginEnabled("mods")).toBe(false);
  });

  it("tracking one plugin's enabled state doesn't enable another", () => {
    setPluginEnabled("mods", true);
    expect(isPluginEnabled("some-other-plugin")).toBe(false);
  });

  it("listPlugins delegates to the list_plugins command", async () => {
    invokeMock.mockResolvedValueOnce([{ id: "mods", name: "Mod Manager", description: "..." }]);
    const plugins = await listPlugins();
    expect(invokeMock).toHaveBeenCalledWith("list_plugins");
    expect(plugins).toEqual([{ id: "mods", name: "Mod Manager", description: "..." }]);
  });

  it("openPluginWindow delegates to the open_plugin_window command with the plugin id", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await openPluginWindow("mods");
    expect(invokeMock).toHaveBeenCalledWith("open_plugin_window", { pluginId: "mods" });
  });
});
