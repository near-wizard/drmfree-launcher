import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PluginsView } from "./PluginsView";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const modManager = {
  id: "mods",
  name: "Mod Manager",
  description: "Enable, disable, and reorder local mods.",
  has_window: true,
};
const auditPlugin = {
  id: "audit",
  name: "Automated Freedom-Test Audit",
  description: "Run local automated checks.",
  has_window: false,
};

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

  it("renders no Open button for a feature-flag plugin, and explains where it appears instead", async () => {
    invokeMock.mockResolvedValueOnce([auditPlugin]);
    render(<PluginsView />);

    expect(await screen.findByText("Automated Freedom-Test Audit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.getByText("Appears inline on each game card in your Library.")).toBeInTheDocument();
  });

  it("still lets a feature-flag plugin be toggled on and off", async () => {
    invokeMock.mockResolvedValueOnce([auditPlugin]);
    const user = userEvent.setup();
    render(<PluginsView />);

    const checkbox = await screen.findByRole("checkbox", { name: /enabled/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("shows no inline-location note and no window-vs-flag confusion for a window plugin", async () => {
    invokeMock.mockResolvedValueOnce([modManager]);
    render(<PluginsView />);

    await screen.findByText("Mod Manager");
    expect(screen.queryByText("Appears inline on each game card in your Library.")).not.toBeInTheDocument();
  });
});
