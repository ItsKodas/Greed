import { describe, expect, it } from "vitest";
import type { GameDeps } from "@backroom/core";
import { blackjackAdapter } from "./adapter.js";

/** A ledger that records what the game asked to move, without a database. */
function ledger(balances: Record<string, number> = {}) {
  const moves: string[] = [];
  const deps: GameDeps = {
    async take(userId, amount) {
      if ((balances[userId] ?? 0) < amount) {
        moves.push(`refused ${userId} -${amount}`);
        return false;
      }
      balances[userId] = (balances[userId] ?? 0) - amount;
      moves.push(`take ${userId} ${amount}`);
      return true;
    },
    async give(userId, amount) {
      balances[userId] = (balances[userId] ?? 0) + amount;
      moves.push(`give ${userId} ${amount}`);
    },
    async record() {},
    async finished() {},
  };
  return { deps, moves, balances };
}

const identity = (userId: string) => ({ userId, avatar: null, accentColor: null });

describe("what blackjack does with chips", () => {
  it("takes a stake as it is placed, not at the deal", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances, moves } = ledger({ u1: 10_000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);

    expect(balances["u1"]).toBe(9000);
    expect(moves).toEqual(["take u1 1000"]);
  });

  it("charges only the difference when a bet is changed", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances } = ledger({ u1: 10_000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "bet", amount: 1500 }, deps);
    // Not 2,500: changing your mind before the deal is not two bets.
    expect(balances["u1"]).toBe(8500);

    await game.act(table, "a", { type: "bet", amount: 500 }, deps);
    expect(balances["u1"]).toBe(9500);
  });

  it("refuses a bet that cannot be covered, and leaves the seat alone", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances } = ledger({ u1: 300 });

    await expect(
      game.act(table, "a", { type: "bet", amount: 1000 }, deps),
    ).rejects.toThrow(/cannot cover/i);
    expect(balances["u1"]).toBe(300);
    expect(table.seats[0]?.bet).toBe(0);
  });

  it("takes the extra for a double before dealing the card", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances } = ledger({ u1: 10_000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "deal" }, deps);
    if (table.phase === "playing" && table.seats[0]?.cards.length === 2) {
      await game.act(table, "a", { type: "double" }, deps);
      expect(balances["u1"]).toBe(8000);
      expect(table.seats[0]?.bet).toBe(2000);
    }
  });

  it("will not double on chips that are not there", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances } = ledger({ u1: 1000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "deal" }, deps);
    expect(balances["u1"]).toBe(0);
    if (table.phase === "playing") {
      await expect(game.act(table, "a", { type: "double" }, deps)).rejects.toThrow(/cannot cover/i);
      // The hand is untouched: no third card, and the stake is what it was.
      expect(table.seats[0]?.bet).toBe(1000);
    }
  });

  it("only ever gives at settlement, because the stakes are already gone", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, moves } = ledger({ u1: 10_000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "deal" }, deps);
    while (table.phase === "playing") {
      await game.act(table, "a", { type: "stand" }, deps);
    }
    expect(game.isSettled(table)).toBe(true);

    const before = moves.length;
    await game.settle(table, deps);
    // Whatever the outcome, settlement never takes anything.
    expect(moves.slice(before).every((move) => move.startsWith("give"))).toBe(true);
  });

  it("refuses a verb it does not have", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps } = ledger({ u1: 10_000 });
    await expect(game.act(table, "a", { type: "roll" }, deps)).rejects.toThrow(/not something/i);
  });
});
