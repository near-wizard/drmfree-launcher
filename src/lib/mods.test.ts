import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getChosenModsDir,
  listMods,
  setChosenModsDir,
  setModOrder,
  suggestModDirs,
  toggleMod,
} from "./mods";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("mods", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("listMods delegates to list_mods with the given directory", async () => {
    const entries = [{ name: "Cool.esp", raw_name: "Cool.esp", enabled: true, is_dir: false }];
    invokeMock.mockResolvedValueOnce(entries);
    const result = await listMods("C:\\Games\\Skyrim\\Data");
    expect(invokeMock).toHaveBeenCalledWith("list_mods", { dir: "C:\\Games\\Skyrim\\Data" });
    expect(result).toEqual(entries);
  });

  it("toggleMod delegates to toggle_mod with dir/rawName/enabled", async () => {
    invokeMock.mockResolvedValueOnce("Cool.esp.disabled");
    const newName = await toggleMod("C:\\Mods", "Cool.esp", false);
    expect(invokeMock).toHaveBeenCalledWith("toggle_mod", {
      dir: "C:\\Mods",
      rawName: "Cool.esp",
      enabled: false,
    });
    expect(newName).toBe("Cool.esp.disabled");
  });

  it("setModOrder delegates to set_mod_order with dir/order", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await setModOrder("C:\\Mods", ["Beta.esp", "Alpha.esp"]);
    expect(invokeMock).toHaveBeenCalledWith("set_mod_order", {
      dir: "C:\\Mods",
      order: ["Beta.esp", "Alpha.esp"],
    });
  });

  it("suggestModDirs delegates to suggest_mod_dirs with installDir", async () => {
    invokeMock.mockResolvedValueOnce(["C:\\Games\\Skyrim\\Data"]);
    const result = await suggestModDirs("C:\\Games\\Skyrim");
    expect(invokeMock).toHaveBeenCalledWith("suggest_mod_dirs", { installDir: "C:\\Games\\Skyrim" });
    expect(result).toEqual(["C:\\Games\\Skyrim\\Data"]);
  });

  it("getChosenModsDir returns null when nothing was ever set for that game", () => {
    expect(getChosenModsDir("steam", "12345")).toBeNull();
  });

  it("setChosenModsDir then getChosenModsDir round-trips for the same game", () => {
    setChosenModsDir("steam", "12345", "C:\\Games\\Skyrim\\Data");
    expect(getChosenModsDir("steam", "12345")).toBe("C:\\Games\\Skyrim\\Data");
  });

  it("setChosenModsDir for one game does not leak into another game's lookup", () => {
    setChosenModsDir("steam", "12345", "C:\\Games\\Skyrim\\Data");
    expect(getChosenModsDir("gog", "12345")).toBeNull();
    expect(getChosenModsDir("steam", "99999")).toBeNull();
  });

  it("setChosenModsDir overwrites a previous choice for the same game", () => {
    setChosenModsDir("steam", "12345", "C:\\old\\path");
    setChosenModsDir("steam", "12345", "C:\\new\\path");
    expect(getChosenModsDir("steam", "12345")).toBe("C:\\new\\path");
  });
});
