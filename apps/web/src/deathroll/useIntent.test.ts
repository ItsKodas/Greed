// @vitest-environment jsdom
import type { TableView } from "@backroom/game-death-roll";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GRACE_MS, PATIENCE_MS, useIntent } from "./useIntent.js";

/**
 * The bargain in CLAUDE.md, tested on a clock rather than by eye.
 *
 * A number the player chose can be shown at once; a fact only the server knows
 * cannot be. On a machine talking to itself the reply lands inside a frame, so
 * a version of this that never worked would look perfect right up until
 * somebody played from another continent. Every test here holds the reply.
 */

/** A duel with two seats, holding whatever this test needs it to hold. */
function dueling(overrides: Partial<TableView> = {}): TableView {
  const seat = (id: string, name: string) => ({
    id,
    name,
    connected: true,
    waiting: false,
    isBot: false,
    avatar: null,
    accentColor: null,
    passed: false,
    purse: null,
  });
  return {
    code: "ABCDE",
    phase: "dueling",
    seats: [seat("ada", "Ada"), seat("bram", "Bram")],
    watching: 0,
    forFun: false,
    maxSeats: 2,
    ante: 500,
    opening: 1_000,
    passPrice: 50,
    ceiling: 1_000,
    pot: 1_000,
    toRoll: "ada",
    turnEndsAt: null,
    lastRoll: null,
    lastPass: null,
    history: [],
    loserId: null,
    winnerIds: [],
    waitingFor: null,
    shortId: null,
    lastEvent: null,
    you: seat("ada", "Ada"),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("pressing roll", () => {
  it("starts the number tumbling before the server has answered", () => {
    const act_ = vi.fn();
    const { result } = renderHook(() => useIntent(dueling(), "ada", act_));

    act(() => result.current.roll());

    // Tumbling is not a guessed result — the digits are visibly unresolved.
    // What must never happen is a number appearing and then changing.
    expect(result.current.rolling).toBe(true);
    expect(act_).toHaveBeenCalledWith({ type: "roll" }, expect.any(Function));
  });

  it("settles when the table speaks, and not before", () => {
    let done = () => {};
    const act_ = vi.fn((_: unknown, cb: () => void) => {
      done = cb;
    });
    const { result, rerender } = renderHook(
      ({ state }) => useIntent(state, "ada", act_),
      { initialProps: { state: dueling() } },
    );

    act(() => result.current.roll());
    expect(result.current.rolling).toBe(true);

    act(() => done());
    rerender({ state: dueling({ ceiling: 743 }) });

    expect(result.current.rolling).toBe(false);
  });

  it("gives up on it if the table refuses", () => {
    // A refusal still acknowledges — the ack fires whether a move was taken
    // or turned down — but nothing about the felt ever moves to explain it,
    // because a refusal never sends a state of its own. So this only clears
    // once the ack's own short grace has run out, not the instant it fires.
    vi.useFakeTimers();
    let done = () => {};
    const act_ = vi.fn((_: unknown, cb: () => void) => {
      done = cb;
    });
    const { result } = renderHook(() => useIntent(dueling(), "ada", act_));

    act(() => result.current.roll());
    expect(result.current.rolling).toBe(true);

    act(() => done());
    // Short of the grace period: still trusted, because the answer to an
    // accepted roll has not had time to arrive either.
    act(() => vi.advanceTimersByTime(GRACE_MS - 50));
    expect(result.current.rolling).toBe(true);

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.rolling).toBe(false);
  });

  it("gives up on it if the answer never comes", () => {
    // Held past the timeout with fake timers; rolling must go back to false
    // rather than spinning for ever.
    vi.useFakeTimers();
    const act_ = vi.fn();
    const { result } = renderHook(() => useIntent(dueling(), "ada", act_));

    act(() => result.current.roll());
    expect(result.current.rolling).toBe(true);

    act(() => vi.advanceTimersByTime(PATIENCE_MS + 1));

    expect(result.current.rolling).toBe(false);
  });
});

describe("pressing pass", () => {
  it("puts the chips down on the press, because the price is not a guess", () => {
    // The stake is the player's own number, so it may be shown at once —
    // unlike a roll, which is the server's to know.
    const act_ = vi.fn();
    const { result } = renderHook(() => useIntent(dueling(), "ada", act_));

    act(() => result.current.pass());

    expect(result.current.pending).toBe(50);
  });

  it("takes them back if the table refuses", () => {
    // Anything shown early is given up on if it is refused.
    vi.useFakeTimers();
    let done = () => {};
    const act_ = vi.fn((_: unknown, cb: () => void) => {
      done = cb;
    });
    const { result } = renderHook(() => useIntent(dueling(), "ada", act_));

    act(() => result.current.pass());
    expect(result.current.pending).toBe(50);

    act(() => done());
    act(() => vi.advanceTimersByTime(GRACE_MS + 1));

    expect(result.current.pending).toBe(0);
  });
});
