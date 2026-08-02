import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  it("presents the workout logger", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Training speichern" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trainingshistorie" })).toBeInTheDocument();
  });
});
