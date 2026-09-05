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

  it("treats a well-formed code as an invitation to that table", () => {
    renderAt("/GBQKF");
    expect(screen.getByText(/invited to table/i)).toBeDefined();
  });

  it("lower-cases links still find the table", () => {
    renderAt("/gbqkf");
    expect(screen.getByText(/GBQKF/)).toBeDefined();
  });
});
