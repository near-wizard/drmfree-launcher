import { describe, it, expect, beforeEach } from "vitest";
import { addManualGame, loadManualGames, removeManualGame, manualEntryToGame, MANUAL_PROVIDER } from "./manualGames";

describe("manualGames", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(loadManualGames()).toEqual([]);
  });

  it("adds and persists an entry", () => {
    const entry = addManualGame({ name: "Celeste", exePath: "C:\\Games\\Celeste\\Celeste.exe", installDir: "C:\\Games\\Celeste" });
    expect(loadManualGames()).toEqual([entry]);
    expect(entry.name).toBe("Celeste");
  });

  it("trims whitespace and blanks out empty optional fields", () => {
    const entry = addManualGame({ name: "  Celeste  ", exePath: "  ", installDir: null });
    expect(entry.name).toBe("Celeste");
    expect(entry.exePath).toBeNull();
    expect(entry.installDir).toBeNull();
  });

  it("removes an entry by id", () => {
    const a = addManualGame({ name: "A", exePath: null, installDir: null });
    const b = addManualGame({ name: "B", exePath: null, installDir: null });
    removeManualGame(a.id);
    expect(loadManualGames()).toEqual([b]);
  });

  it("assigns each entry a unique id", () => {
    const a = addManualGame({ name: "A", exePath: null, installDir: null });
    const b = addManualGame({ name: "B", exePath: null, installDir: null });
    expect(a.id).not.toBe(b.id);
  });
});

describe("manualEntryToGame", () => {
  it("maps a manual entry to a drm-free Game with the manual provider", () => {
    const entry = addManualGame({ name: "Celeste", exePath: "C:\\Games\\Celeste.exe", installDir: "C:\\Games" });
    const game = manualEntryToGame(entry);
    expect(game.provider).toBe(MANUAL_PROVIDER);
    expect(game.id).toBe(entry.id);
    expect(game.name).toBe("Celeste");
    expect(game.exe_path).toBe("C:\\Games\\Celeste.exe");
    expect(game.install_dir).toBe("C:\\Games");
    expect(game.drm.status).toBe("drm-free");
    expect(game.drm.method).toBe("manual_review");
    expect(game.drm.source).toBe("self-reported");
    expect(game.drm.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
