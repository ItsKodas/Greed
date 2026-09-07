import type { GameDeps } from "@backroom/core";
import { TableError } from "@backroom/core";
import { describe, expect, it } from "vitest";
import { blackjackAdapter } from "./adapter.js";
import { Table } from "./table.js";
import type { TableView } from "./table.js";

/**
 * A ledger that refuses to be used.
 *
 * The whole promise of a for-fun table is that the economy never hears about
 * it, and the way to check a promise like that is to make breaking it loud.
 */
function forbidden() {
  const touched: string[] = [];
  const deps: GameDeps = {
    async take(userId, amount) {
      touched.push(`take ${userId} ${amount}`);
      return true;
    },
    async give(userId, amount) {
      touched.push(`give ${userId} ${amount}`);
    },
    async record(userId) {
      touched.push(`record ${userId}`);
    },
    async finished() {
      touched.push("finished");
    },
  };
  return { deps, touched };
}

const identity = (userId: string) => ({ userId, avatar: null, accentColor: null });
const view = (table: Table) => table.view(null) as TableView;

describe("sitting down at a table playing for nothing", () => {
  it("lets a guest sit, which a table playing for chips does not", () => {
    const fun = new Table("FUN01", Math.random, true);
    expect(() => fun.join("a", "Ada")).not.toThrow();

    const real = new Table("REAL1");
    expect(() => real.join("a", "Ada")).toThrow(/sign in/i);
  });

  it("deals a guest play money to stake", () => {
    const table = new Table("FUN01", Math.random, true);
    table.join("a", "Ada");
    expect(view(table).seats[0]?.purse).toBeGreaterThan(0);
    expect(view(table).forFun).toBe(true);
  });

  it("takes a stake out of the purse and gives it back on a change of mind", () => {
    const table = new Table("FUN01", Math.random, true);
    table.join("a", "Ada");
    const start = view(table).seats[0]?.purse ?? 0;

    table.bet("a", 500);
    expect(view(table).seats[0]?.purse).toBe(start - 500);

    // Changing a bet is not spending twice.
    table.bet("a", 1000);
    expect(view(table).seats[0]?.purse).toBe(start - 1000);

    table.bet("a", 0);
    expect(view(table).seats[0]?.purse).toBe(start);
  });

  it("will not let a purse be overdrawn", () => {
    const table = new Table("FUN01", Math.random, true);
    table.join("a", "Ada");
    const start = view(table).seats[0]?.purse ?? 0;

    expect(() => table.bet("a", start + 100)).toThrow(TableError);
    // And the refusal cost nothing.
    expect(view(table).seats[0]?.purse).toBe(start);
  });

  it("pays the purse when the hand settles", () => {
    const table = new Table("FUN01", Math.random, true);
    table.join("a", "Ada");
    const start = view(table).seats[0]?.purse ?? 0;

    table.bet("a", 500);
    table.deal();
    while (table.currentSeat() !== null) {
      table.stand("a");
    }

    const seat = view(table).seats[0];
    const hand = seat?.hands[0];
    expect(hand?.outcome).not.toBeNull();
    // Staked out of the purse, paid back into it: the table is the only bank.
    expect(seat?.purse).toBe(start - 500 + (hand?.returned ?? 0));
  });

  it("tops a dry purse back up rather than ending the evening", () => {
    /*
     * There is nothing to protect at a table playing for nothing. Running out
     * of play money should end a hand, not the night.
     */
    const table = new Table("FUN01", Math.random, true);
    const seat = table.join("a", "Ada");
    seat.purse = 0;
    table.bet("a", 0);

    // Force a settled hand so there is something to deal on from.
    seat.purse = 200;
    table.bet("a", 100);
    table.deal();
    while (table.currentSeat() !== null) {
      table.stand("a");
    }
    // Whatever the hand did, drain it and ask for another.
    (table.seats[0] as { purse: number }).purse = 0;
    table.beginBetting();

    expect(view(table).seats[0]?.purse).toBeGreaterThanOrEqual(view(table).minBet);
  });
});

describe("what a for-fun table costs the economy", () => {
  it("nothing at all, from the first bet to the last payout", async () => {
    const adapter = blackjackAdapter();
    const table = adapter.create("FUN01", { forFun: true }) as Table;
    const book = forbidden();

    // A guest and a signed-in player at the same table: neither is charged.
    table.join("a", "Ada");
    table.join("b", "Bram", identity("u2"));

    await adapter.act(table, "a", { type: "bet", amount: 500 }, book.deps);
    await adapter.act(table, "b", { type: "bet", amount: 500 }, book.deps);
    await adapter.act(table, "a", { type: "deal" }, book.deps);

    while (table.currentSeat() !== null) {
      const seat = table.currentSeat();
      await adapter.act(table, seat?.id ?? "", { type: "stand" }, book.deps);
    }

    expect(adapter.isSettled(table)).toBe(true);
    await adapter.settle(table, book.deps);

    // Not "took nothing" — never asked. A hand that cost nobody anything is
    // also on nobody's record, for the same reason a friendly Greed game is.
    expect(book.touched).toEqual([]);
  });

  it("still charges properly at a table playing for chips", async () => {
    const adapter = blackjackAdapter();
    const table = adapter.create("REAL1") as Table;
    const book = forbidden();

    table.join("a", "Ada", identity("u1"));
    await adapter.act(table, "a", { type: "bet", amount: 500 }, book.deps);

    // The guard above is only worth anything if the other path still moves.
    expect(book.touched).toEqual(["take u1 500"]);
  });
});
