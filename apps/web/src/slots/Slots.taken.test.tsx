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
  // Mirrors socket.io's own flag: false once a middleware refusal has given
  // up on reconnecting, true while a transport failure is still being retried.
  active: true,
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
    fake.active = true;
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
    // A middleware refusal is one socket.io has given up retrying.
    fake.active = false;
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

  it("leaves the machine alone for a dropped connection, because it is not a refusal", async () => {
    /*
     * connect_error also fires for an ordinary transport failure, and
     * socket.io keeps retrying those on its own — `active` stays true. That
     * is nothing this window did wrong, so it must not be shown as one.
     */
    show();
    fake.active = true;
    handlers.get("connect_error")?.(new Error("xhr poll error"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("xhr poll error")).toBeNull();
  });
});
