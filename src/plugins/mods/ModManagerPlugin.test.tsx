import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModManagerPlugin } from "./ModManagerPlugin";
import type { Game } from "../../types/game";
import { setChosenModsDir } from "../../lib/mods";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "12345",
    name: "Example Game",
    provider: "steam",
    install_dir: null,
    exe_path: null,
    drm: { status: "drm-free", source: null, method: null, verified_on: null },
    ...overrides,
  };
}

async function setup(games: Game[] = [makeGame()]) {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_games") return Promise.resolve(games);
    if (cmd === "suggest_mod_dirs") return Promise.resolve([]);
    throw new Error(`unexpected invoke: ${cmd}`);
  });
  const utils = render(<ModManagerPlugin />);
  await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_games"));
  return utils;
}

describe("ModManagerPlugin", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("lists installed games in the picker once loaded", async () => {
    await setup([makeGame({ name: "Example Game" })]);
    expect(await screen.findByRole("option", { name: "Example Game" })).toBeInTheDocument();
  });

  it("shows an error banner if list_games fails, without crashing", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    render(<ModManagerPlugin />);
    expect(await screen.findByText(/couldn't load your library/i)).toBeInTheDocument();
  });

  it("no mods folder input shows until a game is selected", async () => {
    await setup();
    expect(screen.queryByLabelText(/mods folder/i)).not.toBeInTheDocument();
  });

  it("selecting a game reveals the mods-folder input", async () => {
    const user = userEvent.setup();
    await setup([makeGame()]);
    await user.selectOptions(screen.getByLabelText("Game"), "steam:12345");
    expect(await screen.findByLabelText(/mods folder/i)).toBeInTheDocument();
  });

  it("typing a folder and clicking 'Use this folder' lists what's inside via list_mods", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_games") return Promise.resolve([makeGame()]);
      if (cmd === "suggest_mod_dirs") return Promise.resolve([]);
      if (cmd === "list_mods")
        return Promise.resolve([
          { name: "CoolMod.esp", raw_name: "CoolMod.esp", enabled: true, is_dir: false },
        ]);
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    render(<ModManagerPlugin />);
    await user.selectOptions(await screen.findByLabelText("Game"), "steam:12345");
    await user.type(screen.getByLabelText(/mods folder/i), "C:\\Mods");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("list_mods", { dir: "C:\\Mods" }),
    );
    expect(await screen.findByText("CoolMod.esp")).toBeInTheDocument();
    expect(screen.getByText(/bookkeeping only/i)).toBeInTheDocument();
  });

  it("toggling a mod calls toggle_mod and re-lists", async () => {
    const user = userEvent.setup();
    let toggled = false;
    invokeMock.mockImplementation((cmd: string, args: Record<string, unknown>) => {
      if (cmd === "list_games") return Promise.resolve([makeGame()]);
      if (cmd === "suggest_mod_dirs") return Promise.resolve([]);
      if (cmd === "list_mods")
        return Promise.resolve([
          {
            name: "CoolMod.esp",
            raw_name: toggled ? "CoolMod.esp.disabled" : "CoolMod.esp",
            enabled: !toggled,
            is_dir: false,
          },
        ]);
      if (cmd === "toggle_mod") {
        expect(args).toEqual({ dir: "C:\\Mods", rawName: "CoolMod.esp", enabled: false });
        toggled = true;
        return Promise.resolve("CoolMod.esp.disabled");
      }
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    render(<ModManagerPlugin />);
    await user.selectOptions(await screen.findByLabelText("Game"), "steam:12345");
    await user.type(screen.getByLabelText(/mods folder/i), "C:\\Mods");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));
    await screen.findByText("CoolMod.esp");

    await user.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("toggle_mod", expect.any(Object)));
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });

  it("clicking a suggested conventional subfolder uses it directly without further typing", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_games")
        return Promise.resolve([makeGame({ install_dir: "C:\\Games\\Example" })]);
      if (cmd === "suggest_mod_dirs") return Promise.resolve(["C:\\Games\\Example\\Mods"]);
      if (cmd === "list_mods") return Promise.resolve([]);
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    render(<ModManagerPlugin />);
    await user.selectOptions(await screen.findByLabelText("Game"), "steam:12345");
    const suggestionBtn = await screen.findByRole("button", { name: "C:\\Games\\Example\\Mods" });
    await user.click(suggestionBtn);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("list_mods", { dir: "C:\\Games\\Example\\Mods" }),
    );
  });

  it("remembers the previously chosen folder for a game across reselection", async () => {
    setChosenModsDir("steam", "12345", "C:\\Remembered\\Mods");
    const user = userEvent.setup();
    await setup();
    await user.selectOptions(screen.getByLabelText("Game"), "steam:12345");
    expect(screen.getByLabelText(/mods folder/i)).toHaveValue("C:\\Remembered\\Mods");
  });

  it("an empty directory listing says so instead of showing a blank list", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_games") return Promise.resolve([makeGame()]);
      if (cmd === "suggest_mod_dirs") return Promise.resolve([]);
      if (cmd === "list_mods") return Promise.resolve([]);
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    render(<ModManagerPlugin />);
    await user.selectOptions(await screen.findByLabelText("Game"), "steam:12345");
    await user.type(screen.getByLabelText(/mods folder/i), "C:\\EmptyMods");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));
    expect(await screen.findByText(/no files or folders found/i)).toBeInTheDocument();
  });

  it("shows a list_mods error inline without crashing", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_games") return Promise.resolve([makeGame()]);
      if (cmd === "suggest_mod_dirs") return Promise.resolve([]);
      if (cmd === "list_mods") return Promise.reject(new Error("not a directory"));
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    render(<ModManagerPlugin />);
    await user.selectOptions(await screen.findByLabelText("Game"), "steam:12345");
    await user.type(screen.getByLabelText(/mods folder/i), "C:\\NotReal");
    await user.click(screen.getByRole("button", { name: /use this folder/i }));
    expect(await screen.findByText(/not a directory/i)).toBeInTheDocument();
  });
});
