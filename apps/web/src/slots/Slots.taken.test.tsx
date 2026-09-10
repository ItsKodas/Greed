// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (arg: unknown) => void>();
const fake = {
  on: (event: string, run: (arg: unknown) => void) => {
    handlers.set(event, run);
  },
  emit: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
};
const made = vi.fn(() => fake);

vi.mock("socket.io-client", () => ({ io: (...args: unknown[]) => made(...args) }));

import { MemoryRouter } from "react-router-dom";
import Slots from "./Slots.js";

/*
 * The Navbar reaches for a Link, and useAccount reaches for /api/me. Neither
 * is what this file is about, so both are stood up rather than worked around.
 */
function show() {
  return render(
    <MemoryRouter>
      <Slots />
    </MemoryRouter>,
  );
}

describe("a slots window that came second", () => {
  beforeEach(() => {
    handlers.clear();
    made.mockClear();
    window.sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
  });

  it("names slots and its window in the handshake", () => {
    show();
    const options = made.mock.calls[0]?.[1] as {
      auth?: { game?: string; window?: string };
    };
    expect(options.auth?.game).toBe("slots");
    expect(options.auth?.window).toBe(window.sessionStorage.getItem("backroom.window"));
  });

  it("shows the panel in place of the machine, not over it", async () => {
    show();
    handlers.get("connect_error")?.(
      new Error("You already have Slots open in another window."),
    );
    await waitFor(() =>
      expect(
        screen.getByText("You already have Slots open in another window."),
      ).toBeTruthy(),
    );
    // A lever still drawn behind the message is something that looks pressable
    // and is not.
    expect(document.querySelector(".slots__floor")).toBeNull();
  });
});
