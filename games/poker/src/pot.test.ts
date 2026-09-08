import { describe, expect, it } from "vitest";
import type { Contribution } from "./pot.js";
import { pots, split } from "./pot.js";

/**
 * Side pots.
 *
 * The part of poker that pays somebody the wrong amount if it is even slightly
 * wrong, and the part nobody notices being wrong until it is theirs. Every
 * test here asserts the same thing twice over: who can win each pot, and that
 * the chips add up to exactly what went in — because a side-pot bug shows up
 * either as the wrong winner or as chips that quietly stopped existing.
 */

const paid = (seatId: string, amount: number, contesting = true): Contribution => ({
  seatId,
  paid: amount,
  contesting,
});

/** Everything that went in, for the check that nothing evaporates. */
const staked = (all: Contribution[]) => all.reduce((total, one) => total + one.paid, 0);

describe("building the pots", () => {
  it("makes one pot when everybody covered the same bet", () => {
    const all = [paid("a", 100), paid("b", 100), paid("c", 100)];
    const built = pots(all);
    expect(built).toHaveLength(1);
    expect(built[0]?.chips).toBe(300);
    expect(built[0]?.eligible.sort()).toEqual(["a", "b", "c"]);
  });

  it("cuts a side pot when somebody is all in for less", () => {
    /*
     * `a` is in for 50 and cannot win more than 50 from each of the others.
     * So: a main pot of 150 that all three contest, and a side pot of 100 that
     * only `b` and `c` can.
     */
    const all = [paid("a", 50), paid("b", 100), paid("c", 100)];
    const built = pots(all);
    expect(built).toHaveLength(2);
    expect(built[0]?.chips).toBe(150);
    expect(built[0]?.eligible.sort()).toEqual(["a", "b", "c"]);
    expect(built[1]?.chips).toBe(100);
    expect(built[1]?.eligible.sort()).toEqual(["b", "c"]);
    expect(built.reduce((t, p) => t + p.chips, 0)).toBe(staked(all));
  });

  it("cuts two side pots for two all-ins at different levels", () => {
    const all = [paid("a", 25), paid("b", 60), paid("c", 100), paid("d", 100)];
    const built = pots(all);
    expect(built).toHaveLength(3);
    expect(built[0]).toEqual({ chips: 100, eligible: ["a", "b", "c", "d"] });
    expect(built[1]).toEqual({ chips: 105, eligible: ["b", "c", "d"] });
    expect(built[2]).toEqual({ chips: 80, eligible: ["c", "d"] });
    expect(built.reduce((t, p) => t + p.chips, 0)).toBe(staked(all));
  });

  it("keeps a folded player's chips and drops their claim", () => {
    // Folding leaves the money on the table. It does not take it off.
    const all = [paid("a", 100), paid("b", 100, false), paid("c", 100)];
    const built = pots(all);
    expect(built).toHaveLength(1);
    expect(built[0]?.chips).toBe(300);
    expect(built[0]?.eligible.sort()).toEqual(["a", "c"]);
  });

  it("gives an uncalled bet back rather than leaving it in a pot nobody wins", () => {
    /*
     * `b` bet 300 into `a`'s 100 and everybody folded. The top two hundred is
     * `b`'s own money with nobody contesting it, so it must not sit in a pot
     * of its own — it belongs back where it came from, which the table does by
     * finding one pot rather than two.
     */
    const all = [paid("a", 100, false), paid("b", 300)];
    const built = pots(all);
    expect(built).toHaveLength(1);
    expect(built[0]?.eligible).toEqual(["b"]);
    expect(built[0]?.chips).toBe(staked(all));
  });

  it("never loses a chip, whatever the shape", () => {
    /*
     * The property that matters more than any single arrangement: for every
     * mixture of stacks and folds tried here, what comes out equals what went
     * in. A side-pot bug is nearly always a chip that stopped existing.
     */
    const amounts = [0, 10, 25, 50, 100];
    for (const a of amounts) {
      for (const b of amounts) {
        for (const c of amounts) {
          for (const folded of [0, 1, 2, 3]) {
            const all = [
              paid("a", a, folded !== 1),
              paid("b", b, folded !== 2),
              paid("c", c, folded !== 3),
            ];
            const built = pots(all);
            expect(built.reduce((t, p) => t + p.chips, 0)).toBe(staked(all));
            // And nothing is owed to somebody who folded.
            for (const pot of built) {
              expect(pot.eligible).not.toContain(["a", "b", "c"][folded - 1] ?? "none");
            }
          }
        }
      }
    }
  });

  it("makes nothing out of nothing", () => {
    expect(pots([])).toEqual([]);
    expect(pots([paid("a", 0), paid("b", 0)])).toEqual([]);
  });
});

describe("splitting a pot", () => {
  it("divides it evenly when it divides evenly", () => {
    expect([...split(300, ["a", "b", "c"])]).toEqual([
      ["a", 100],
      ["b", 100],
      ["c", 100],
    ]);
  });

  it("gives the odd chips to the earliest seats, and never invents one", () => {
    // Chips are whole, so somebody gets the odd one and it has to be the same
    // somebody every time. 302 between three is 101, 101, 100.
    const shared = split(302, ["a", "b", "c"]);
    expect([...shared.values()]).toEqual([101, 101, 100]);
    expect([...shared.values()].reduce((t, n) => t + n, 0)).toBe(302);
  });

  it("hands the whole pot to a lone winner", () => {
    expect([...split(175, ["a"])]).toEqual([["a", 175]]);
  });

  it("pays nobody rather than throwing when there is nobody to pay", () => {
    expect([...split(100, [])]).toEqual([]);
  });

  it("adds up for every pot size across every number of winners", () => {
    for (let chips = 0; chips < 200; chips += 1) {
      for (const winners of [["a"], ["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d"]]) {
        const shared = split(chips, winners);
        expect([...shared.values()].reduce((t, n) => t + n, 0)).toBe(chips);
      }
    }
  });
});
