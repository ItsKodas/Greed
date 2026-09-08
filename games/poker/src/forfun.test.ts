import { describe, expect, it } from "vitest";
import type { Card } from "./cards.js";
import { pokerAdapter } from "./adapter.js";
import { decide, strength } from "./bot.js";
import type { Seat } from "./table.js";
import { FUN_STACK, Table } from "./table.js";

/**
 * A table playing for nothing, and the bots that only sit at one.
 *
 * The rules of the game do not change here — a hand is a hand. What changes is
 * everything either side of it: who may sit down, who may be dealt in, and
 * above all where the chips came from and where they go. That last one is the
 * line the whole building is arranged around, so most of this file is about it.
 */

const identity = (userId: string) => ({ userId, avatar: null, accentColor: null });

function funTable(maxSeats = 6): Table {
  let at = 1;
  const random = () => {
    at = (at * 1103515245 + 12345) % 2147483648;
    return at / 2147483648;
  };
  return new Table("FUN01", random, 50, 100, maxSeats, 30_000, true);
}

function chipsTable(): Table {
  return new Table("CHP01", Math.random, 50, 100, 6);
}

describe("who may sit at a table playing for nothing", () => {
  it("lets somebody with no account sit down", () => {
    // Nobody signs in to play for nothing, and asking them to would be asking
    // for a name to write on a receipt that is never issued.
    const table = funTable();
    expect(() => table.join("a", "Ada", null)).not.toThrow();
  });

  it("still turns a guest away from a table playing for chips", () => {
    const table = chipsTable();
    expect(() => table.join("a", "Ada", null)).toThrow(/sign in/i);
  });

  it("seats a bot with play money in front of it", () => {
    const table = funTable();
    const bot = table.addBot("bot:1", "Pockets", "normal");
    expect(bot.isBot).toBe(true);
    expect(bot.stack).toBe(FUN_STACK);
  });

  it("refuses a bot at a table playing for chips", () => {
    /*
     * The rule the building rests on, at the one door it could walk through. A
     * bot has no account to take chips from and none to pay them to, so a hand
     * won against one for real chips is chips from nowhere.
     */
    const table = chipsTable();
    expect(() => table.addBot("bot:1", "Pockets", "normal")).toThrow(/for fun/i);
  });
});

describe("where the play money goes", () => {
  it("owes nobody anything when a signed-in player stands up", () => {
    /*
     * The one that would actually mint chips, and it is not far-fetched: a
     * signed-in player sitting at a for-fun table is the ordinary case, and
     * paying their play-money stack into their account is a button that prints
     * money. Guarded on the table rather than on whether the seat has a user.
     */
    const table = funTable();
    table.join("a", "Ada", identity("u1"));
    table.addBot("bot:1", "Pockets", "normal");
    table.buyIn("a", FUN_STACK);
    table.deal();

    table.leave("a");

    expect(table.owedOut).toEqual([]);
  });

  it("still owes a signed-in player their stack at a table playing for chips", () => {
    // The other half of the same check: the guard is about the table, and must
    // not have quietly switched off paying people at a real one.
    const table = chipsTable();
    table.join("a", "Ada", identity("u1"));
    table.join("b", "Bram", identity("u2"));
    table.buyIn("a", 2_000);
    table.buyIn("b", 2_000);

    table.leave("a");

    expect(table.owedOut).toEqual([{ userId: "u1", name: "Ada", chips: 2_000 }]);
  });

  it("asks the economy for nothing when somebody sits down for fun", async () => {
    /*
     * Through the adapter, because that is the only place poker ever touches
     * an account — and the whole point of a for-fun table is that this call
     * never happens.
     */
    const adapter = pokerAdapter();
    const table = adapter.create("FUN01", { forFun: true }) as Table;
    table.join("a", "Ada", identity("u1"));

    const asked: string[] = [];
    await adapter.act(
      table,
      "a",
      { type: "buyIn" },
      {
        take: async () => {
          asked.push("take");
          return true;
        },
        give: async () => {
          asked.push("give");
        },
        record: async () => undefined,
        finished: async () => undefined,
      },
    );

    expect(asked).toEqual([]);
    expect(table.seats[0]?.stack).toBe(FUN_STACK);
  });
});

describe("a bot with a hand in front of it", () => {
  const card = (text: string): Card => {
    const suits = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;
    return {
      rank: text.slice(0, -1) as Card["rank"],
      suit: suits[text.slice(-1) as keyof typeof suits],
    };
  };

  /** A seat holding two named cards, and nothing else that matters here. */
  const holding = (one: string, two: string, stack = 2_000): Seat =>
    ({
      id: "bot:1",
      name: "Pockets",
      hole: [card(one), card(two)],
      stack,
      committed: 0,
      paid: 0,
      folded: false,
      allIn: false,
      acted: false,
      waiting: false,
      showed: null,
      isBot: true,
      skill: "normal",
      connected: true,
      userId: null,
      avatar: null,
      accentColor: null,
    }) as unknown as Seat;

  const felt = { board: [] as Card[], bigBlind: 100 };
  /* No randomness, so a decision is the same decision every run. */
  const never = () => 1;

  it("thinks more of aces than of a seven-deuce", () => {
    expect(strength(holding("As", "Ad"), [])).toBeGreaterThan(
      strength(holding("7s", "2d"), []),
    );
  });

  it("reads a made hand off the board rather than guessing", () => {
    const board = [card("Ah"), card("Ac"), card("Kd"), card("2s"), card("9h")];
    // Trips against nothing at all, on the same five cards.
    expect(strength(holding("As", "5d"), board)).toBeGreaterThan(
      strength(holding("7s", "3d"), board),
    );
  });

  it("checks rather than folds when staying in is free", () => {
    // Folding a hand that owes nothing is the one move that can only lose.
    const choice = decide(holding("7s", "2d"), felt, 0, 200, 2_000, "normal", never);
    expect(choice.move).toBe("check");
  });

  it("folds rubbish that costs something", () => {
    const choice = decide(holding("7s", "2d"), felt, 100, 200, 2_000, "normal", never);
    expect(choice.move).toBe("fold");
  });

  it("pays for a hand worth paying for", () => {
    const choice = decide(holding("As", "Ad"), felt, 100, 200, 2_000, "normal", never);
    expect(choice.move).toBe("call");
  });

  it("never asks to raise beyond what it has", () => {
    /*
     * A raise past the stack is refused by the table, and refused inside a bot
     * move is a throw with nobody behind it to hear — so it is caught here
     * rather than there.
     */
    const always = () => 0;
    for (const stack of [120, 300, 1_000, 5_000]) {
      const seat = holding("As", "Ad", stack);
      const most = seat.committed + seat.stack;
      const choice = decide(seat, felt, 100, Math.min(200, most), most, "normal", always);
      if (choice.move === "raise") {
        expect(choice.to).toBeLessThanOrEqual(most);
      }
    }
  });
});

describe("a whole hand against bots", () => {
  it("plays itself out without anybody being owed a chip", () => {
    const table = funTable();
    table.join("a", "Ada", identity("u1"));
    table.buyIn("a", FUN_STACK);
    table.addBot("bot:1", "Pockets", "normal");
    table.addBot("bot:2", "Old Ned", "easy");
    const adapter = pokerAdapter();

    table.deal();
    expect(table.street).toBe("preflop");

    /*
     * The bots move themselves; Ada folds the moment she is asked. What this
     * is really watching is that a table of mostly bots reaches the end of a
     * hand at all — a bot that stalls on its own turn is a table that never
     * comes round again.
     */
    for (let step = 0; step < 60 && table.street !== "showdown"; step += 1) {
      if (table.toAct === "a") {
        table.act("a", "fold");
        continue;
      }
      const move = adapter.botMove?.(table) ?? null;
      if (move === null) {
        break;
      }
      move.play();
    }

    expect(table.street).toBe("showdown");
    expect(table.owedOut).toEqual([]);
    // Every play chip still at the table: nothing was minted and nothing lost.
    const total = table.seats.reduce((sum, seat) => sum + seat.stack, 0) + table.pot;
    expect(total).toBe(FUN_STACK * 3);
  });
});
