import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("presents the workout logger", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Training speichern" })).toBeInTheDocument();
  });
});
