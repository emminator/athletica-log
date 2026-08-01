import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("presents the training call to action", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: "Training starten" })).toBeInTheDocument();
  });
});

