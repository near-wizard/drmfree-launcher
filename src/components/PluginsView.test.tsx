import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PluginsView } from "./PluginsView";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const modManager = { id: "mods", name: "Mod Manager", description: "Enable, disable, and reorder local mods." };

describe("PluginsView", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("lists a registered plugin as disabled by default, with Open disabled", async () => {
    invokeMock.mockResolvedValueOnce([modManager]);
    render(<PluginsView />);

    expect(await screen.findByText("Mod Manager")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /enabled/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
  });

  it("enabling the toggle allows opening the plugin window", async () => {
    invokeMock.mockResolvedValueOnce([modManager]);
    const user = userEvent.setup();
    render(<PluginsView />);

    await screen.findByText("Mod Manager");
    await user.click(screen.getByRole("checkbox", { name: /enabled/i }));
    const openButton = screen.getByRole("button", { name: "Open" });
    expect(openButton).toBeEnabled();

    invokeMock.mockResolvedValueOnce(undefined);
    await user.click(openButton);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("open_plugin_window", { pluginId: "mods" }));
  });

  it("shows a message when no plugins are registered", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<PluginsView />);
    expect(await screen.findByText("No plugins registered yet.")).toBeInTheDocument();
  });
});
