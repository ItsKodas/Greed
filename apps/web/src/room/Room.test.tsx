// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Room } from "./Room.js";

const GAMES = [
  {
    id: "greed",
    name: "Greed",
    blurb: "Six dice, bank it or lose it.",
    shape: "table",
    open: true,
    tables: 2,
    seated: 4,
    watching: 0,
  },
  {
    id: "slots",
    name: "Slots",
    blurb: "Five reels, nine lines.",
    shape: "machine",
    open: true,
    tables: 1,
    seated: 1,
    watching: 0,
  },
  {
    id: "tips",
    name: "The Tip Jar",
    blurb: "Nothing to lose.",
    shape: "bar",
    open: true,
    tables: 1,
    seated: 1,
    watching: 0,
  },
  {
    id: "taunts",
    name: "Taunts",
    blurb: "Not about money at all.",
    shape: "party",
    open: true,
    tables: 1,
    seated: 2,
    watching: 0,
  },
];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/room") {
        return { ok: true, json: async () => ({ games: GAMES }) };
      }
      if (url === "/api/me") {
        return { ok: true, json: async () => ({ signedIn: false, signinAvailable: false }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <MemoryRouter>
      <Room />
    </MemoryRouter>,
  );
}

describe("the room's groups", () => {
  it("puts a bar game in its own group, between the machines and the back", async () => {
    stubFetch();
    show();

    await waitFor(() => {
      expect(screen.getByText("In the back")).toBeTruthy();
    });

    const labels = screen.getAllByText(
      /^(At the tables|Against the wall|At the bar|In the back)$/,
    );
    expect(labels.map((node) => node.textContent)).toEqual([
      "At the tables",
      "Against the wall",
      "At the bar",
      "In the back",
    ]);
  });
});
