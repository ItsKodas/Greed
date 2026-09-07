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
    expect(table.seats[0]?.hands[0]?.bet).toBe(0);
  });

  it("takes the extra for a double before dealing the card", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps, balances } = ledger({ u1: 10_000 });

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "deal" }, deps);
    if (table.phase === "playing" && table.seats[0]?.hands[0]?.cards.length === 2) {
      await game.act(table, "a", { type: "double" }, deps);
      expect(balances["u1"]).toBe(8000);
      expect(table.seats[0]?.hands[0]?.bet).toBe(2000);
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
      expect(table.seats[0]?.hands[0]?.bet).toBe(1000);
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

  it("pays the hand that was played, not the one the clock started", async () => {
    /*
     * The bug this is here for: settlement talks to the economy, so it yields,
     * and a table that runs itself clears the felt on a timer. Settling by
     * reading the seats after each await paid whatever was left of the hand —
     * which, once the next betting window had opened, was nothing.
     */
    const game = blackjackAdapter({ settleMs: 60 });
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));

    const moves: string[] = [];
    let counted: number | null = null;
    let reported: number | null = null;
    // Held at the first thing settlement asks the economy for, whatever that
    // turns out to be: a losing hand never calls give at all.
    let open = () => {};
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    let reached = () => {};
    const parked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let held = false;
    const hold = async () => {
      if (held) {
        return;
      }
      held = true;
      reached();
      await released;
    };
    const deps: GameDeps = {
      async take() {
        return true;
      },
      async give(userId, amount) {
        await hold();
        moves.push(`give ${userId} ${amount}`);
      },
      async record(_userId, entry) {
        await hold();
        counted = entry.shared?.chipsWon ?? null;
      },
      async finished(game_) {
        await hold();
        reported = game_.players[0]?.net ?? null;
      },
    };

    await game.act(table, "a", { type: "bet", amount: 1000 }, deps);
    await game.act(table, "a", { type: "deal" }, deps);
    while (table.phase === "playing") {
      await game.act(table, "a", { type: "stand" }, deps);
    }
    // What the hand was actually worth, read while it is still on the felt.
    const back = table.view().seats[0]?.hands.reduce((total, hand) => total + hand.returned, 0) ?? 0;

    const settling = game.settle(table, deps);
    await parked;
    // The clock, going off in the middle of settlement.
    table.beginBetting();
    open();
    await settling;

    expect(table.view().seats[0]?.bet).toBe(0);
    expect(moves).toEqual(back > 0 ? [`give u1 ${back}`] : []);
    expect(counted).toBe(back - 1000);
    expect(reported).toBe(back - 1000);
  });

  it("refuses a verb it does not have", async () => {
    const game = blackjackAdapter();
    const table = game.create("TEST1");
    table.join("a", "Ada", identity("u1"));
    const { deps } = ledger({ u1: 10_000 });
    await expect(game.act(table, "a", { type: "roll" }, deps)).rejects.toThrow(/not something/i);
  });
});
