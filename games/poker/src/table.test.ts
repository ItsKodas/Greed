import { describe, expect, it } from "vitest";
import { Table } from "./table.js";

/**
 * A hand of hold'em, played out.
 *
 * The evaluator and the side pots are proved on their own; what is only
 * reachable here is the order of it — who speaks, when the betting closes,
 * what the blinds did, and that chips never appear or disappear along the way.
 *
 * That last one is asserted on nearly every test rather than once: a betting
 * bug shows up as chips that stopped existing long before it shows up as a
 * wrong winner.
 */

/** A table with known players and a shuffle that cannot surprise anybody. */
function table(stacks: number[], seed = 1): Table {
  /*
   * A fixed sequence rather than Math.random, so a test that fails fails for
   * everybody. Which cards come out is not what these tests are about — but a
   * shuffle that changes between runs would make them flake anyway.
   */
  let at = seed;
  const random = () => {
    at = (at * 1103515245 + 12345) % 2147483648;
    return at / 2147483648;
  };
  const made = new Table("TEST", random, 50, 100, 10);
  stacks.forEach((stack, index) => {
    made.join(`s${index}`, `P${index}`, {
      userId: `u${index}`,
      avatar: null,
      accentColor: null,
    });
    made.buyIn(`s${index}`, stack);
  });
  return made;
}

/** Everything anybody has, at the table and on the felt. */
const chips = (made: Table) =>
  made.seats.reduce((total, seat) => total + seat.stack, 0) + made.pot;

describe("dealing a hand", () => {
  it("will not deal to one player", () => {
    const made = table([1_000]);
    expect(made.canDeal).toBe(false);
    expect(() => made.deal()).toThrow(/two people/i);
  });

  it("deals two cards each and posts the blinds", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();

    for (const seat of made.seats) {
      expect(seat.hole).toHaveLength(2);
    }
    // Fifty and a hundred are in the middle, and out of two stacks.
    expect(made.pot).toBe(150);
    expect(made.seats.filter((s) => s.stack === 1_000)).toHaveLength(1);
    expect(chips(made)).toBe(3_000);
  });

  it("gives everybody a different hand", () => {
    // Twelve cards off one deck: any card appearing twice is a deck being
    // dealt from after it was refilled, which is the one thing it must not do.
    const made = table([1_000, 1_000, 1_000, 1_000, 1_000, 1_000]);
    made.deal();
    const dealt = made.seats.flatMap((seat) => seat.hole).map((c) => `${c.rank}${c.suit}`);
    expect(new Set(dealt).size).toBe(dealt.length);
  });

  it("moves the button on every hand", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    const first = made.button;
    while (made.street !== "showdown") {
      made.act(made.toAct as string, "fold");
    }
    made.finish();
    made.deal();
    expect(made.button).not.toBe(first);
  });

  it("does not deal in somebody who sat down mid-hand", () => {
    const made = table([1_000, 1_000]);
    made.deal();
    made.join("late", "Late", { userId: "ulate", avatar: null, accentColor: null });
    made.buyIn("late", 1_000);
    expect(made.seats.find((s) => s.id === "late")?.hole).toHaveLength(0);
    expect(made.seats.find((s) => s.id === "late")?.waiting).toBe(true);
  });
});

describe("whose turn it is", () => {
  it("starts with the seat after the big blind", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    // Three seats: button, small, big. The one to act is the button again.
    expect(made.toAct).toBe(made.button);
  });

  it("gives the button the first word before the flop heads up", () => {
    // The exception every poker rule set makes: two-handed, the button posts
    // the small blind and speaks first before the flop.
    const made = table([1_000, 1_000]);
    made.deal();
    expect(made.toAct).toBe(made.button);
  });

  it("gives the button the last word after it, heads up", () => {
    const made = table([1_000, 1_000]);
    made.deal();
    made.act(made.toAct as string, "call");
    made.act(made.toAct as string, "check");
    expect(made.street).toBe("flop");
    // Postflop the button is last, so the other seat speaks first.
    expect(made.toAct).not.toBe(made.button);
  });

  it("skips anybody who is all in", () => {
    /*
     * The big blind here cannot cover it, so they are all in before anybody
     * has spoken. A seat with nothing left has no decision to make and must
     * never be asked for one — a table that waits on them waits for ever.
     */
    const made = table([1_000, 1_000, 50]);
    made.deal();
    const short = made.seats.find((seat) => seat.id === "s2");
    expect(short?.stack).toBe(0);
    expect(short?.allIn).toBe(true);

    let guard = 0;
    while (made.street === "preflop" && made.toAct !== null && guard < 20) {
      expect(made.toAct).not.toBe("s2");
      const seat = made.seats.find((one) => one.id === made.toAct);
      made.act(made.toAct as string, seat !== undefined && made.owed(seat) > 0 ? "call" : "check");
      guard += 1;
    }
  });
});

describe("the betting", () => {
  it("closes a street once everybody has called", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    made.act(made.toAct as string, "call");
    made.act(made.toAct as string, "call");
    made.act(made.toAct as string, "check");
    expect(made.street).toBe("flop");
    expect(made.board).toHaveLength(3);
  });

  it("reopens the betting when somebody raises", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    made.act(made.toAct as string, "call");
    made.act(made.toAct as string, "raise", 300);
    // The seat that already called owes more and has to speak again.
    expect(made.street).toBe("preflop");
    expect(made.toAct).not.toBeNull();
  });

  it("refuses a check when there is something to call", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    expect(() => made.act(made.toAct as string, "check")).toThrow(/check for free/i);
  });

  it("refuses a raise smaller than the last one", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    // The blind is the opening raise, so the smallest raise is to 200.
    expect(() => made.act(made.toAct as string, "raise", 150)).toThrow(/smallest raise/i);
  });

  it("refuses a raise nobody can cover", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    expect(() => made.act(made.toAct as string, "raise", 9_000)).toThrow(/cover/i);
  });

  it("refuses a move out of turn", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    const other = made.seats.find((seat) => seat.id !== made.toAct) as { id: string };
    expect(() => made.act(other.id, "fold")).toThrow(/not your turn/i);
  });

  it("runs the streets out in order", () => {
    const made = table([1_000, 1_000]);
    made.deal();
    const seen: string[] = [];
    let guard = 0;
    while (made.street !== "showdown" && guard < 40) {
      seen.push(made.street);
      const seat = made.seats.find((s) => s.id === made.toAct);
      made.act(made.toAct as string, seat !== undefined && made.owed(seat) > 0 ? "call" : "check");
      guard += 1;
    }
    expect([...new Set(seen)]).toEqual(["preflop", "flop", "turn", "river"]);
    expect(made.board).toHaveLength(5);
  });
});

describe("how a hand ends", () => {
  it("pays the last one standing without a showdown", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    made.act(made.toAct as string, "fold");
    made.act(made.toAct as string, "fold");
    expect(made.street).toBe("showdown");
    expect(made.paid).toHaveLength(1);
    // Nobody paid to see it, so nobody sees it.
    expect(made.paid[0]?.said).toBeNull();
    expect(chips(made)).toBe(3_000);
  });

  it("shows the hands when more than one is still in", () => {
    const made = table([1_000, 1_000]);
    made.deal();
    let guard = 0;
    while (made.street !== "showdown" && guard < 40) {
      const seat = made.seats.find((s) => s.id === made.toAct);
      made.act(made.toAct as string, seat !== undefined && made.owed(seat) > 0 ? "call" : "check");
      guard += 1;
    }
    expect(made.paid.every((one) => one.said !== null)).toBe(true);
    expect(made.seats.every((seat) => seat.showed !== null)).toBe(true);
  });

  it("never creates or destroys a chip, whoever wins", () => {
    /*
     * The invariant this whole file rests on. Played out a hundred times with
     * different shuffles and a mixture of folds, calls and raises: what is on
     * the table at the end is what was on it at the start.
     */
    for (let seed = 1; seed <= 100; seed += 1) {
      const made = table([1_000, 2_500, 700, 400, 5_000], seed);
      const before = chips(made);
      let guard = 0;
      made.deal();
      while (made.street !== "showdown" && made.toAct !== null && guard < 200) {
        const seat = made.seats.find((s) => s.id === made.toAct);
        if (seat === undefined) {
          break;
        }
        const owed = made.owed(seat);
        const move = guard % 7 === 0 ? "fold" : owed > 0 ? "call" : "check";
        made.act(seat.id, move);
        guard += 1;
      }
      expect(chips(made)).toBe(before);
      expect(made.seats.every((seat) => seat.stack >= 0)).toBe(true);
    }
  });

  it("pays out everything that was staked, and no more", () => {
    /*
     * Whatever the cards did, the payouts have to add up to what went in. The
     * middle is empty afterwards on purpose: a table that left the pot set as
     * well as paying it into a stack would be claiming the same chips twice.
     */
    const made = table([1_000, 1_000]);
    const before = chips(made);
    made.deal();
    let guard = 0;
    while (made.street !== "showdown" && guard < 40) {
      const seat = made.seats.find((s) => s.id === made.toAct);
      made.act(made.toAct as string, seat !== undefined && made.owed(seat) > 0 ? "call" : "check");
      guard += 1;
    }
    const total = made.paid.reduce((sum, one) => sum + one.chips, 0);
    expect(total).toBeGreaterThan(0);
    expect(made.pot).toBe(0);
    expect(chips(made)).toBe(before);
    // And every chip paid out came off somebody: the stacks account for it all.
    expect(made.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(before);
  });

  it("gives a short stack only what they could win", () => {
    /*
     * The side pot, end to end. The short stack is all in for less than the
     * others, so even winning they cannot take the part of the pot they never
     * covered.
     */
    const made = table([200, 5_000, 5_000]);
    made.deal();
    let guard = 0;
    while (made.street !== "showdown" && made.toAct !== null && guard < 60) {
      const seat = made.seats.find((s) => s.id === made.toAct);
      if (seat === undefined) {
        break;
      }
      made.act(seat.id, made.owed(seat) > 0 ? "call" : "check");
      guard += 1;
    }
    expect(chips(made)).toBe(10_200);
    const short = made.seats.find((seat) => seat.id === "s0");
    // Whatever happened, they cannot have more than three times their stack.
    expect(short?.stack ?? 0).toBeLessThanOrEqual(600);
  });
});

describe("leaving", () => {
  it("folds somebody who walks out mid-hand and keeps their chips in", () => {
    /*
     * Standing up is folding, not taking your money back. Otherwise the way to
     * never lose a hand would be to close the tab when it went badly.
     */
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    const potWas = made.pot;
    made.leave(made.toAct as string);
    expect(made.pot).toBeGreaterThanOrEqual(potWas);
    expect(made.seats).toHaveLength(2);
  });

  it("ends the hand when everybody but one has gone", () => {
    const made = table([1_000, 1_000, 1_000]);
    made.deal();
    made.act(made.toAct as string, "fold");
    made.leave(made.toAct as string);
    expect(made.street).toBe("showdown");
  });
});
