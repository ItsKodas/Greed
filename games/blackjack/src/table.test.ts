import { TableError } from "@backroom/core";
import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards.js";
import { Table } from "./table.js";

/**
 * A table dealing a known sequence.
 *
 * The shoe takes its randomness from outside, so a shuffle can be replaced by
 * an arrangement — which is the only way to assert what a hand pays.
 */
function stacked(...ranks: Rank[]): Table {
  const table = new Table("TEST1");
  const cards: Card[] = ranks.map((rank) => ({ rank, suit: "spades" }));
  // The shoe draws off the end, so the order is reversed going in.
  const stack = [...cards].reverse();
  // Anything past the arrangement is a two, which never surprises anyone.
  Object.defineProperty(table, "shoe", {
    value: {
      refresh() {},
      draw: () => stack.pop() ?? ({ rank: "2", suit: "hearts" } as Card),
    },
  });
  return table;
}

function seatTwo(table: Table) {
  table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
  table.join("b", "Bo", { userId: "u2", avatar: null, accentColor: null });
}

describe("taking a stake", () => {
  it("refuses a guest, because there is no friendly blackjack", () => {
    const table = new Table("TEST1");
    expect(() => table.join("a", "Ada")).toThrow(/sign in/i);
  });

  it("keeps a bet inside the table limits", () => {
    const table = new Table("TEST1");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    expect(() => table.bet("a", 50)).toThrow(TableError);
    expect(() => table.bet("a", 50_000)).toThrow(TableError);
    table.bet("a", 500);
    expect(table.seats[0]?.bet).toBe(500);
  });

  it("lets a stake be taken back off the felt before the deal", () => {
    const table = new Table("TEST1");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.bet("a", 0);
    expect(table.seats[0]?.bet).toBe(0);
    // And so there is nothing left to deal to.
    expect(() => table.deal("a")).toThrow(/nobody has bet/i);
  });

  it("will not deal with nothing on the table", () => {
    const table = new Table("TEST1");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    expect(() => table.deal("a")).toThrow(/nobody has bet/i);
  });

  it("is the host's deal", () => {
    const table = new Table("TEST1");
    seatTwo(table);
    table.bet("a", 500);
    expect(() => table.deal("b")).toThrow(/only the host/i);
  });
});

describe("the dealer's hole card", () => {
  it("is not in the view while the hand is being played", () => {
    // Ada 10, dealer 9, Ada 7, dealer K — so the dealer's second card is a king.
    const table = stacked("10", "9", "7", "K");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");

    const view = table.view("a");
    /*
     * Absent rather than flagged. A card that reaches the browser has been
     * dealt to everybody whatever the markup says, so the check is that it is
     * not in the payload at all.
     */
    expect(view.dealer.cards).toHaveLength(1);
    expect(view.dealer.cards[0]?.rank).toBe("9");
    expect(view.dealer.hidden).toBe(true);
    expect(JSON.stringify(view)).not.toContain('"K"');
  });

  it("is face up once the dealer has played", () => {
    const table = stacked("10", "9", "7", "K");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");
    table.stand("a");

    const view = table.view("a");
    expect(view.dealer.hidden).toBe(false);
    expect(view.dealer.cards.length).toBeGreaterThanOrEqual(2);
    expect(view.dealer.total).toBe(19);
  });
});

describe("playing a hand", () => {
  it("gives each player their turn in order", () => {
    const table = stacked("5", "6", "9", "7", "K", "8");
    seatTwo(table);
    table.bet("a", 500);
    table.bet("b", 500);
    table.deal("a");

    expect(table.currentSeat()?.id).toBe("a");
    expect(() => table.hit("b")).toThrow(/not your turn/i);
    table.stand("a");
    expect(table.currentSeat()?.id).toBe("b");
  });

  it("ends a turn the moment a hand busts", () => {
    // Ada 10, dealer 6, Ada 9, dealer 5, then a king for Ada.
    const table = stacked("10", "6", "9", "5", "K");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");

    table.hit("a");
    expect(table.seats[0]?.outcome).toBe("bust");
    expect(table.phase).toBe("settled");
  });

  it("does not deal the dealer cards it does not need", () => {
    /*
     * Everyone bust, so there is nothing to beat. The house keeps the stakes
     * whatever it would have drawn, and drawing anyway only invites an
     * argument about what came out of the shoe.
     */
    const table = stacked("10", "6", "9", "5", "K");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");
    table.hit("a");

    expect(table.dealer).toHaveLength(2);
    expect(table.seats[0]?.returned).toBe(0);
  });

  it("doubles for exactly one card, and only at the start", () => {
    const table = stacked("5", "6", "6", "5", "9");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");

    const extra = table.double("a");
    expect(extra).toBe(500);
    expect(table.seats[0]?.bet).toBe(1000);
    expect(table.seats[0]?.cards).toHaveLength(3);
    expect(table.seats[0]?.done).toBe(true);
  });

  it("refuses a double once a card has been taken", () => {
    const table = stacked("5", "6", "6", "5", "2", "9");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");
    table.hit("a");
    expect(() => table.double("a")).toThrow(/first two cards/i);
  });
});

describe("what a hand pays", () => {
  /** Plays one hand out and reports what came back. */
  function payout(ranks: Rank[], play: (table: Table) => void = (t) => t.stand("a")) {
    const table = stacked(...ranks);
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 1000);
    table.deal("a");
    if (table.phase === "playing") {
      play(table);
    }
    const seat = table.seats[0];
    return { outcome: seat?.outcome, returned: seat?.returned, bet: seat?.bet };
  }

  it("pays a blackjack three to two, with the stake back", () => {
    // Ada A, dealer 9, Ada K, dealer 7 — Ada has twenty-one on two cards.
    expect(payout(["A", "9", "K", "7"])).toEqual({
      outcome: "blackjack",
      returned: 2500,
      bet: 1000,
    });
  });

  it("pays a plain win evens", () => {
    // Ada 10, dealer 9, Ada 9 (19), dealer 7 (16), dealer draws a 2 to 18.
    expect(payout(["10", "9", "9", "7", "2"])).toEqual({
      outcome: "won",
      returned: 2000,
      bet: 1000,
    });
  });

  it("returns the stake on a push", () => {
    // Both on nineteen.
    expect(payout(["10", "9", "9", "K"])).toEqual({ outcome: "push", returned: 1000, bet: 1000 });
  });

  it("keeps the stake when the dealer is closer", () => {
    // Ada 18, dealer 20.
    expect(payout(["10", "K", "8", "K"])).toEqual({ outcome: "lost", returned: 0, bet: 1000 });
  });

  it("pays everyone standing when the dealer busts", () => {
    // Ada 15 and stands; dealer 6 + 6 = 12, draws a king to 22.
    expect(payout(["10", "6", "5", "6", "K"])).toEqual({
      outcome: "won",
      returned: 2000,
      bet: 1000,
    });
  });

  it("ties two blackjacks rather than paying either", () => {
    // Ada A K, dealer A K.
    expect(payout(["A", "A", "K", "K"])).toEqual({
      outcome: "push",
      returned: 1000,
      bet: 1000,
    });
  });

  it("beats a plain twenty-one with a blackjack, and says which is which", () => {
    // Ada 7 7 7 the long way; dealer A K on two.
    const table = stacked("7", "A", "7", "K", "7");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 1000);
    table.deal("a");
    table.hit("a");
    expect(table.seats[0]?.outcome).toBe("lost");
  });

  it("pays double what was doubled", () => {
    // Ada 5 6, doubles into a 9 for twenty; dealer 6 5 draws to nineteen.
    const table = stacked("5", "6", "6", "5", "9", "8");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 1000);
    table.deal("a");
    table.double("a");
    expect(table.seats[0]?.bet).toBe(2000);
    expect(table.seats[0]?.outcome).toBe("won");
    expect(table.seats[0]?.returned).toBe(4000);
  });
});

describe("another hand", () => {
  it("clears the table and keeps everybody at it", () => {
    const table = stacked("10", "9", "9", "K");
    seatTwo(table);
    table.bet("a", 500);
    table.deal("a");
    table.stand("a");
    expect(table.phase).toBe("settled");

    table.nextHand("a");

    expect(table.phase).toBe("betting");
    expect(table.seats).toHaveLength(2);
    expect(table.seats.every((seat) => seat.bet === 0 && seat.cards.length === 0)).toBe(true);
    expect(table.dealer).toHaveLength(0);
  });

  it("deals in whoever arrived while the last hand was running", () => {
    const table = stacked("10", "9", "9", "K");
    table.join("a", "Ada", { userId: "u1", avatar: null, accentColor: null });
    table.bet("a", 500);
    table.deal("a");

    const late = table.join("c", "Cy", { userId: "u3", avatar: null, accentColor: null });
    expect(late.waiting).toBe(true);
    // Refused because a hand is running, which is the only way to be waiting.
    expect(() => table.bet("c", 500)).toThrow(/already been dealt/i);

    table.stand("a");
    table.nextHand("a");
    expect(table.seats.every((seat) => !seat.waiting)).toBe(true);
    table.bet("c", 500);
    expect(table.seats[1]?.bet).toBe(500);
  });
});
