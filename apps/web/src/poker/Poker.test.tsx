// @vitest-environment jsdom
import type { SeatView, TableView } from "@backroom/game-poker";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TableSocketHook } from "../table/useTableSocket.js";
import { Actions, Felt } from "./Poker.js";

/**
 * The felt, given a table.
 *
 * These render the real components against a real view rather than checking
 * pieces of arithmetic, because the mistakes worth catching here are the ones
 * that only exist once the two are put together: a felt reading a field the
 * view does not have, somebody else's cards arriving face up, or a control
 * offered to a seat that is not allowed to press it.
 */

const seat = (over: Partial<SeatView> & { id: string; name: string }): SeatView => ({
  connected: true,
  waiting: false,
  avatar: null,
  accentColor: null,
  stack: 2_000,
  committed: 0,
  folded: false,
  allIn: false,
  hole: [],
  showed: null,
  ...over,
});

const view = (over: Partial<TableView> = {}): TableView => ({
  you: null,
  code: "ABCDE",
  street: "preflop",
  board: [],
  pot: 30,
  toAct: null,
  turnEndsAt: null,
  button: null,
  smallBlindId: null,
  bigBlindId: null,
  smallBlind: 10,
  bigBlind: 20,
  paid: [],
  lastEvent: null,
  watching: 0,
  seats: [],
  ...over,
});

/** A socket that records what it was asked to send and does nothing else. */
function stub(): TableSocketHook<TableView> & { sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  return {
    sent,
    state: null,
    listed: true,
    seatId: null,
    error: null,
    connected: true,
    busy: false,
    chat: [],
    say: vi.fn(),
    addBot: vi.fn(),
    setListed: vi.fn(),
    create: vi.fn(),
    join: vi.fn(),
    watch: vi.fn(),
    leave: vi.fn(),
    act: (action: Record<string, unknown>) => {
      sent.push(action);
    },
  };
}

describe("the felt", () => {
  it("renders a dealt hand without reaching for a field a poker seat has not got", () => {
    /*
     * Blunt, and worth it. The first version of this screen borrowed
     * blackjack's sound hook, which reads `seat.hands` and a dealer — a poker
     * seat has neither, and it typechecked because the view was cast. What
     * that costs is not a wrong number but a blank screen.
     */
    const table = stub();
    render(
      <Felt
        table={table}
        seatId="s1"
        state={view({
          street: "flop",
          board: [
            { rank: "A", suit: "hearts" },
            { rank: "K", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
          seats: [
            seat({ id: "s1", name: "Ada", hole: [{ rank: "Q", suit: "spades" }, null] }),
            seat({ id: "s2", name: "Bram", hole: [null, null] }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Bram")).toBeTruthy();
  });

  it("keeps everybody else's hole cards face down and turns your own up", () => {
    const table = stub();
    const { container } = render(
      <Felt
        table={table}
        seatId="s1"
        state={view({
          seats: [
            seat({
              id: "s1",
              name: "Ada",
              hole: [
                { rank: "A", suit: "spades" },
                { rank: "K", suit: "diamonds" },
              ],
            }),
            seat({ id: "s2", name: "Bram", hole: [null, null] }),
          ],
        })}
      />,
    );

    const mine = container.querySelectorAll(".pk__seat--you .bj-card");
    expect(mine).toHaveLength(2);
    expect([...mine].every((card) => card.classList.contains("bj-card--down"))).toBe(false);

    // Bram's two, and both of them backs.
    const theirs = [...container.querySelectorAll(".pk__seat")]
      .filter((one) => !one.classList.contains("pk__seat--you"))
      .flatMap((one) => [...one.querySelectorAll(".bj-card")]);
    expect(theirs).toHaveLength(2);
    expect(theirs.every((card) => card.classList.contains("bj-card--down"))).toBe(true);
  });

  it("puts your own seat at the bottom whoever you are", () => {
    /*
     * Every other seat is somebody you are looking at, and yours is the one
     * you are looking from. Rotated rather than sorted, so the player on your
     * left is still on your left.
     */
    const table = stub();
    const seats = [
      seat({ id: "s1", name: "Ada" }),
      seat({ id: "s2", name: "Bram" }),
      seat({ id: "s3", name: "Cass" }),
    ];
    const { container } = render(
      <Felt table={table} seatId="s3" state={view({ seats })} />,
    );

    const names = [...container.querySelectorAll(".pk__seat .pk__name")].map(
      (one) => one.textContent,
    );
    // Cass first, then the table carries on in its own order from there.
    expect(names).toEqual(["Cass", "Ada", "Bram"]);
    expect(container.querySelector(".pk__seat--you .pk__name")?.textContent).toBe("Cass");
  });
});

describe("what you are offered", () => {
  const acting = (own: TableView["you"], me: Partial<SeatView> = {}) => {
    const table = stub();
    const mine = seat({ id: "s1", name: "Ada", ...me });
    render(
      <Actions
        table={table}
        state={view({ toAct: "s1", you: own, seats: [mine, seat({ id: "s2", name: "Bram" })] })}
        me={mine}
        intent={{ move: null, committed: null, send: vi.fn() }}
      />,
    );
    return table;
  };

  it("offers a check when nothing is owed, and a call when something is", () => {
    acting({ toCall: 0, minRaiseTo: 40, maxRaiseTo: 2_000, canRaise: true });
    expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Call/ })).toBeNull();
  });

  it("says what a call costs rather than what it comes to", () => {
    // The number a player needs is what leaves their stack, not the total they
    // will have put in — those differ every time they have already bet.
    acting({ toCall: 80, minRaiseTo: 200, maxRaiseTo: 2_000, canRaise: true }, { committed: 20 });
    expect(screen.getByRole("button", { name: "Call 80" })).toBeTruthy();
  });

  it("takes the slider's ends from the table rather than working them out", () => {
    /*
     * The smallest legal raise depends on the size of the last one, which is
     * nowhere in the view. A felt that guessed it would spend half the slider
     * on amounts the table refuses.
     */
    acting({ toCall: 100, minRaiseTo: 400, maxRaiseTo: 2_000, canRaise: true });
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("400");
    expect(slider.max).toBe("2000");
  });

  it("offers no raise to somebody who cannot cover one", () => {
    acting({ toCall: 100, minRaiseTo: 400, maxRaiseTo: 2_000, canRaise: false });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Raise/ })).toBeNull();
  });

  it("calls all in rather than for more than is there", () => {
    // Owing more than you have is not a call, and sending one would be
    // refused. The button says what pressing it actually does.
    acting({ toCall: 900, minRaiseTo: 1_000, maxRaiseTo: 500, canRaise: false }, { stack: 500 });
    expect(screen.getByRole("button", { name: "All in 500" })).toBeTruthy();
  });

  it("offers the buy-in, and only that, to somebody with nothing in front of them", () => {
    const table = stub();
    const mine = seat({ id: "s1", name: "Ada", stack: 0 });
    render(
      <Actions
        table={table}
        state={view({ street: "waiting", seats: [mine] })}
        me={mine}
        intent={{ move: null, committed: null, send: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: /Sit down/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fold" })).toBeNull();
  });

  it("gives somebody watching no controls at all", () => {
    const table = stub();
    render(
      <Actions
        table={table}
        state={view()}
        me={null}
        intent={{ move: null, committed: null, send: vi.fn() }}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/watching/i)).toBeTruthy();
  });
});
