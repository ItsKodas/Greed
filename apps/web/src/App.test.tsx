// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App.js";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("renders the design gallery at /style", () => {
    renderAt("/style");
    expect(screen.getByRole("region", { name: /palette/i })).toBeDefined();
  });

  it("rejects an address that is not shaped like a table code", () => {
    renderAt("/nowhere");
    expect(screen.getByText(/no table with that code/i)).toBeDefined();
  });

  it("looks a bare code up rather than assuming which game it is", () => {
    /*
     * Codes are unique across the room, so a link never names a game. What is
     * at the root is therefore a question rather than an address, and the
     * answer comes from the server.
     */
    renderAt("/GBQKF");
    expect(screen.getByText(/finding that table/i)).toBeDefined();
  });

  it("treats a code under its game as an invitation to that table", () => {
    renderAt("/greed/GBQKF");
    expect(screen.getByText(/invited to table/i)).toBeDefined();
  });

  it("lower-cased links still find the table", () => {
    renderAt("/greed/gbqkf");
    expect(screen.getByText(/GBQKF/)).toBeDefined();
  });

  it("shows the room at the root", () => {
    renderAt("/");
    expect(screen.getByText(/at the tables/i)).toBeDefined();
  });
});
