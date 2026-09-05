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
  it("renders the gallery at /style", () => {
    renderAt("/style");
    expect(screen.getByRole("heading", { name: /greed/i, level: 1 })).toBeDefined();
  });

  it("redirects the root path to the gallery", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: /greed/i, level: 1 })).toBeDefined();
  });

  it("shows a not-found message for an unknown path", () => {
    renderAt("/nowhere");
    expect(screen.getByText(/no such page/i)).toBeDefined();
  });
});
