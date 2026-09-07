import type { GameDeps } from "@backroom/core";
import { TableError } from "@backroom/core";
import { describe, expect, it } from "vitest";
import { blackjackAdapter } from "./adapter.js";
import type { Card, Rank } from "./cards.js";
import { Table } from "./table.js";

/**
 * A table dealing a known sequence.
 *
 * The shoe takes its randomness from outside, so a shuffle can be replaced by
 * an arrangement — which is the only way to say anything definite about a pair.
 */
function stacked(ranks: Rank[], forFun = false): Table {
  const table = new Table("TEST1", Math.random, forFun);
  const stack: Card[] = ranks.map((rank) => ({ rank, suit: "spades" })).reverse();
  Object.defineProperty(table, "shoe", {
    value: {
      refresh() {},
      draw: () => stack.pop() ?? ({ rank: "2", suit: "hearts" } as Card),
    },
  });
  return table;
}

const identity = (userId: string) => ({ userId, avatar: null, accentColor: null });

/**
 * One player dealt the pair named, with the dealer showing what follows.
 *
 * Cards come out in the order a dealer deals them: player, dealer, player,
 * dealer — so the arrangement interleaves.
 */
function dealt(player: [Rank, Rank], dealer: [Rank, Rank], rest: Rank[] = [], forFun = false) {
  const table = stacked([player[0], dealer[0], player[1], dealer[1], ...rest], forFun);
  table.join("a", "Ada", forFun ? null : identity("u1"));
  table.bet("a", 500);
  table.deal();
  return table;
}

const hands = (table: Table) => table.seats[0]?.hands ?? [];

describe("splitting a pair", () => {
  it("makes two hands, each staked like the first", () => {
    const table = dealt(["8", "8"], ["9", "7"], ["3", "4"]);
    expect(hands(table)).toHaveLength(1);

    const extra = table.split("a");

    expect(extra).toBe(500);
    expect(hands(table)).toHaveLength(2);
    expect(hands(table).map((hand) => hand.bet)).toEqual([500, 500]);
    // One card each on top of the one they kept.
    expect(hands(table).map((hand) => hand.cards.length)).toEqual([2, 2]);
    expect(hands(table)[0]?.cards[0]?.rank).toBe("8");
    expect(hands(table)[1]?.cards[0]?.rank).toBe("8");
  });

  it("counts a king and a queen as a pair, because they are both ten", () => {
    const table = dealt(["K", "Q"], ["9", "7"], ["3", "4"]);
    expect(() => table.split("a")).not.toThrow();
    expect(hands(table)).toHaveLength(2);
  });

  it("refuses two cards that are not a pair", () => {
    const table = dealt(["8", "9"], ["9", "7"]);
    expect(() => table.split("a")).toThrow(/pair/i);
    expect(hands(table)).toHaveLength(1);
  });

  it("refuses to split a hand that is already three cards", () => {
    const table = dealt(["4", "4"], ["9", "7"], ["2", "3"]);
    table.hit("a");
    expect(() => table.split("a")).toThrow(/first two cards/i);
  });

  it("refuses to split a hand that was itself made by splitting", () => {
    // Eights, then two more eights off the shoe: a pair again, and still not
    // splittable — one split is all a hand gets.
    const table = dealt(["8", "8"], ["9", "7"], ["8", "8"]);
    table.split("a");
    expect(hands(table)[0]?.cards.map((card) => card.rank)).toEqual(["8", "8"]);
    expect(() => table.split("a")).toThrow(/cannot be split again/i);
  });

  it("gives split aces one card each and no more", () => {
    /*
     * The rule every house keeps. Two live ace hands would be the best hand in
     * the game, so each gets exactly one card and is then finished.
     */
    const table = dealt(["A", "A"], ["9", "7"], ["5", "6"]);
    table.split("a");

    expect(hands(table).every((hand) => hand.done)).toBe(true);
    expect(hands(table).map((hand) => hand.cards.length)).toEqual([2, 2]);
    // Nobody was left waiting on a decision that cannot be made.
    expect(table.currentSeat()).toBeNull();
  });

  it("plays both hands out before the table moves on", () => {
    const table = new Table("TEST1");
    /*
     * Two players, so a round is Ada, Bo, dealer — and there are two rounds
     * before anybody decides anything. Laid out in the order they come off the
     * shoe: Ada gets the eights, Bo two nines, the dealer a five and a six.
     */
    const stack: Card[] = (
      ["8", "9", "5", "8", "9", "6", "3", "4"] as Rank[]
    ).map((rank) => ({ rank, suit: "spades" }));
    Object.defineProperty(table, "shoe", {
      value: { refresh() {}, draw: () => stack.shift() ?? ({ rank: "2", suit: "hearts" } as Card) },
    });
    table.join("a", "Ada", identity("u1"));
    table.join("b", "Bo", identity("u2"));
    table.bet("a", 500);
    table.bet("b", 500);
    table.deal();

    table.split("a");
    // Still Ada's turn, now on the first of her two hands.
    expect(table.currentSeat()?.id).toBe("a");
    expect(table.seats[0]?.active).toBe(0);

    table.stand("a");
    // Her second hand, not Bo — a split is finished before the table moves on.
    expect(table.currentSeat()?.id).toBe("a");
    expect(table.seats[0]?.active).toBe(1);

    table.stand("a");
    expect(table.currentSeat()?.id).toBe("b");
  });

  it("settles each hand on its own account", () => {
    /*
     * The whole point of splitting: one hand can win while the other loses,
     * and a seat is not one result any more.
     */
    const table = dealt(["8", "8"], ["10", "9"], ["K", "2"]);
    table.split("a");
    // Stand on both and let the dealer decide them separately.
    while (table.currentSeat() !== null) {
      table.stand("a");
    }

    const outcomes = hands(table).map((hand) => hand.outcome);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((outcome) => outcome !== null)).toBe(true);
    // Each hand paid against its own stake, never against the pair's.
    for (const hand of hands(table)) {
      expect(hand.returned).toBeLessThanOrEqual(hand.bet * 2);
    }
  });

  it("does not call twenty-one on a split hand a blackjack", () => {
    // Ace and ace split; the first gets a ten. Twenty-one, but assembled.
    const table = dealt(["A", "A"], ["9", "7"], ["K", "3"]);
    table.split("a");
    while (table.currentSeat() !== null) {
      table.stand("a");
    }
    const first = hands(table)[0];
    expect(first?.cards.map((card) => card.rank)).toEqual(["A", "K"]);
    // Twenty-one, and paid like twenty-one rather than three to two.
    expect(first?.outcome).not.toBe("blackjack");
  });
});

describe("what a split costs", () => {
  function ledger(balance: number) {
    const moves: string[] = [];
    let chips = balance;
    const deps: GameDeps = {
      async take(_userId, amount) {
        if (chips < amount) {
          moves.push(`refused ${amount}`);
          return false;
        }
        chips -= amount;
        moves.push(`take ${amount}`);
        return true;
      },
      async give(_userId, amount) {
        chips += amount;
        moves.push(`give ${amount}`);
      },
      async record() {},
      async finished() {},
    };
    return { deps, moves, chips: () => chips };
  }

  it("takes a second stake before the cards move", async () => {
    const adapter = blackjackAdapter();
    const table = dealt(["8", "8"], ["9", "7"], ["3", "4"]);
    const book = ledger(10_000);

    await adapter.act(table, "a", { type: "split" }, book.deps);

    expect(book.moves).toEqual(["take 500"]);
    expect(hands(table)).toHaveLength(2);
  });

  it("gives the stake back when the table refuses the split", async () => {
    const adapter = blackjackAdapter();
    // Not a pair, so the table will refuse after the chips have been taken.
    const table = dealt(["8", "9"], ["9", "7"]);
    const book = ledger(10_000);

    await expect(
      adapter.act(table, "a", { type: "split" }, book.deps),
    ).rejects.toThrow(TableError);

    // Taken, then handed straight back: a refusal costs nobody anything.
    expect(book.moves).toEqual(["take 500", "give 500"]);
    expect(book.chips()).toBe(10_000);
  });

  it("refuses when the chips are not there, and leaves one hand", async () => {
    const adapter = blackjackAdapter();
    const table = dealt(["8", "8"], ["9", "7"], ["3", "4"]);
    const book = ledger(100);

    await expect(
      adapter.act(table, "a", { type: "split" }, book.deps),
    ).rejects.toThrow(/cannot cover/i);

    expect(book.moves).toEqual(["refused 500"]);
    expect(hands(table)).toHaveLength(1);
  });

  it("draws on the purse at a table playing for nothing", () => {
    const table = dealt(["8", "8"], ["9", "7"], ["3", "4"], true);
    const before = table.seats[0]?.purse ?? 0;

    table.split("a");

    expect(table.seats[0]?.purse).toBe(before - 500);
    expect(hands(table)).toHaveLength(2);
  });
});
