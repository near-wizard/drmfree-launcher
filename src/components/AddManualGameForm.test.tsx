import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddManualGameForm } from "./AddManualGameForm";

describe("AddManualGameForm", () => {
  it("requires a name before submitting", async () => {
    const onAdd = vi.fn();
    render(<AddManualGameForm onAdd={onAdd} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Add game" }));
    expect(screen.getByText("Give it a name.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("submits name, exe path, and install dir together", async () => {
    const onAdd = vi.fn();
    render(<AddManualGameForm onAdd={onAdd} onCancel={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText("Game name"), "Celeste");
    await userEvent.type(
      screen.getByPlaceholderText(/Executable path/),
      "C:\\Games\\Celeste\\Celeste.exe",
    );
    await userEvent.type(screen.getByPlaceholderText("Install folder (optional)"), "C:\\Games\\Celeste");
    await userEvent.click(screen.getByRole("button", { name: "Add game" }));
    expect(onAdd).toHaveBeenCalledWith({
      name: "Celeste",
      exePath: "C:\\Games\\Celeste\\Celeste.exe",
      installDir: "C:\\Games\\Celeste",
    });
  });

  it("allows submitting with only a name — exe path is optional", async () => {
    const onAdd = vi.fn();
    render(<AddManualGameForm onAdd={onAdd} onCancel={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText("Game name"), "Celeste");
    await userEvent.click(screen.getByRole("button", { name: "Add game" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "Celeste", exePath: "", installDir: "" });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<AddManualGameForm onAdd={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
