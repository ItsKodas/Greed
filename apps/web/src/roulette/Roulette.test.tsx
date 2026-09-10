// @vitest-environment jsdom
import type { SeatView, TableView } from "@backroom/game-roulette";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableSocketHook } from "../table/useTableSocket.js";
import { Felt } from "./Roulette.js";

afterEach(cleanup);

/**
 * The felt, given a table.
 *
 * Rendered against a real view rather than checked piecemeal, because the
 * mistakes worth catching here only exist once the two are put together: a
 * felt reading a field the view has not got, a control offered to somebody who
 * may not press it, or the result on screen before the ball is in.
 */

const RED = "even:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36";

const seat = (over: Partial<SeatView> & { id: string; name: string }): SeatView => ({
  connected: true,
  waiting: false,
  isBot: false,
  avatar: null,
  accentColor: null,
  staked: 0,
  paid: null,
  purse: null,
  ...over,
});

const view = (over: Partial<TableView> = {}): TableView => ({
  code: "ABCDE",
  phase: "betting",
  deadline: Date.now() + 20_000,
  lastCall: false,
  pocket: null,
  history: [],
  placed: [],
  paid: [],
  bank: 1_000_000,
  seats: [seat({ id: "s1", name: "Ada" })],
  you: seat({ id: "s1", name: "Ada" }),
  forFun: false,
  hostId: "s1",
  watching: 0,
  lastEvent: null,
  window: 30_000,
  ...over,
});

const stub = () => {
  const act = vi.fn();
  return {
    table: { act, busy: false } as unknown as TableSocketHook<TableView>,
    act,
  };
};

describe("the roulette felt", () => {
  it("takes a chip when the window is open", () => {
    const { table, act } = stub();
    render(<Felt table={table} state={view()} seatId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: /^17, pays 35 to 1/ }));
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ type: "place", spotId: "straight:17" }));
  });

  it("takes nothing once the wheel is turning", () => {
    const { table, act } = stub();
    render(<Felt table={table} state={view({ phase: "spinning", pocket: 17 })} seatId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: /^17, pays 35 to 1/ }));
    expect(act).not.toHaveBeenCalled();
  });

  it("takes nothing at last call, so a late chip is never a race", () => {
    const { table, act } = stub();
    render(<Felt table={table} state={view({ lastCall: true })} seatId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: /^17, pays 35 to 1/ }));
    expect(act).not.toHaveBeenCalled();
  });

  it("keeps the result off the cloth until the ball is in", () => {
    /*
     * The view carries the pocket all through the spin, because the wheel
     * needs it to roll the ball to the right place. A felt that passed it
     * straight through would light the winning square seconds early.
     */
    const spinning = render(<Felt table={stub().table} state={view({ phase: "spinning", pocket: 17 })} seatId="s1" />);
    expect(spinning.container.querySelector(".rl__square--won")).toBeNull();
    cleanup();

    const settled = render(<Felt table={stub().table} state={view({ phase: "settled", pocket: 17 })} seatId="s1" />);
    expect(settled.container.querySelector(".rl__square--won")).toBeTruthy();
  });

  it("refuses a chip the bank could not pay out on", () => {
    // Shown rather than enforced — the table refuses it either way — but a
    // player who learns the cap by being refused learns it the worse way.
    const { table, act } = stub();
    render(<Felt table={table} state={view({ bank: 0 })} seatId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: /^17, pays 35 to 1/ }));
    expect(act).not.toHaveBeenCalled();
  });

  it("offers a watcher no controls at all", () => {
    render(<Felt table={stub().table} state={view({ you: null })} seatId={null} />);
    expect(screen.queryByRole("button", { name: "Take it all back" })).toBeNull();
    expect(screen.getByText(/Take a seat to play/)).toBeTruthy();
  });

  it("says what the table is doing", () => {
    const open = render(<Felt table={stub().table} state={view()} seatId="s1" />);
    expect(open.container.textContent).toContain("Place your bets");
    cleanup();

    const last = render(<Felt table={stub().table} state={view({ lastCall: true })} seatId="s1" />);
    expect(last.container.textContent).toContain("Last call");
    cleanup();

    const turning = render(<Felt table={stub().table} state={view({ phase: "spinning", pocket: 3 })} seatId="s1" />);
    expect(turning.container.textContent).toContain("No more bets");
  });

  it("shows what each seat has down, and what the spin did to them", () => {
    const state = view({
      phase: "settled",
      pocket: 32,
      seats: [seat({ id: "s1", name: "Ada", staked: 200 }), seat({ id: "s2", name: "Bram", staked: 100 })],
      paid: [
        { seatId: "s1", name: "Ada", back: 400, staked: 200 },
        { seatId: "s2", name: "Bram", back: 0, staked: 100 },
      ],
    });
    render(<Felt table={stub().table} state={state} seatId="s1" />);
    expect(screen.getByText("+200")).toBeTruthy();
    expect(screen.getByText("-100")).toBeTruthy();
  });

  it("greys the tray down to what a play purse can afford", () => {
    const state = view({ forFun: true, you: seat({ id: "s1", name: "Ada", purse: 60 }) });
    render(<Felt table={stub().table} state={state} seatId="s1" />);
    expect((screen.getByRole("radio", { name: "Bet with 25" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("radio", { name: "Bet with 500" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has nothing to undo before anything is down", () => {
    render(<Felt table={stub().table} state={view()} seatId="s1" />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    const down = view({ you: seat({ id: "s1", name: "Ada", staked: 150 }), placed: [{ seatId: "s1", spotId: RED, chips: 150 }] });
    render(<Felt table={stub().table} state={down} seatId="s1" />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
