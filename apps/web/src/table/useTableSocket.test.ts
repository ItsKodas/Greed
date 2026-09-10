// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
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

import { useTableSocket } from "./useTableSocket.js";

describe("what a table window tells the server about itself", () => {
  beforeEach(() => {
    handlers.clear();
    made.mockClear();
    window.sessionStorage.clear();
  });

  it("names its game and its window in the handshake", () => {
    renderHook(() => useTableSocket("blackjack", () => {}));
    const options = made.mock.calls[0]?.[1] as {
      auth?: { game?: string; window?: string };
    };
    expect(options.auth?.game).toBe("blackjack");
    expect(options.auth?.window).toBe(window.sessionStorage.getItem("backroom.window"));
  });

  it("holds a refusal apart from a disconnection", async () => {
    /*
     * They look nothing alike to a player and must not render alike: one says
     * wait, the other says go and close a tab.
     */
    const { result } = renderHook(() => useTableSocket("blackjack", () => {}));
    handlers.get("connect_error")?.(
      new Error("You already have Blackjack open in another window."),
    );
    await waitFor(() =>
      expect(result.current.taken).toBe(
        "You already have Blackjack open in another window.",
      ),
    );
    expect(result.current.connected).toBe(false);
  });

  it("asks again when told to, because socket.io will not on its own", async () => {
    const { result } = renderHook(() => useTableSocket("blackjack", () => {}));
    handlers.get("connect_error")?.(new Error("You already have Blackjack open in another window."));
    await waitFor(() => expect(result.current.taken).not.toBeNull());
    result.current.retry();
    expect(fake.connect).toHaveBeenCalled();
    await waitFor(() => expect(result.current.taken).toBeNull());
  });
});
