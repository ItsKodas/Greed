import { describe, expect, it } from "vitest";
import { evaluate, PAYS } from "./paytable.js";
import type { Face } from "./strip.js";

const c: Face = "chip";
const d: Face = "dice";
const b: Face = "bell";
const s: Face = "seven";

/** Five columns of three, the way it looks on the glass. */
function grid(...columns: Face[][]): Face[][] {
  return columns;
}

describe("the paytable", () => {
  it("pays more for a longer run of the same face", () => {
    for (const face of Object.keys(PAYS) as Face[]) {
      const three = PAYS[face][3] as number;
      const four = PAYS[face][4] as number;
      expect(four).toBeGreaterThan(three);
      if (PAYS[face][5] !== null) {
        expect(PAYS[face][5] as number).toBeGreaterThan(four);
      }
    }
  });

  it("marks five sevens as the jackpot rather than a multiplier", () => {
    // Null on purpose. The jackpot is a share of the bank, and a number here
    // would be a second way to pay it that could silently disagree with the
    // first.
    expect(PAYS.seven[5]).toBeNull();
  });
});

describe("evaluating a spin", () => {
  it("pays on the line bet, which is a ninth of the stake", () => {
    // Chip three-of-a-kind is 4x the line bet. At a stake of 900 the line bet
    // is 100, so the line is worth 400 — not 3600.
    const g = grid([c, c, c], [c, c, c], [c, c, c], [d, d, d], [d, d, d]);
    const middle = evaluate(g, 900).lines.find((line) => line.line === 0);
    expect(middle?.pay).toBe(400);
  });

  it("floors a payout rather than inventing a fraction of a chip", () => {
    // At a stake of 1 the line bet is a ninth of a chip, and 4x it is still
    // less than one. Nothing is rounded up: a machine that invents a chip is
    // the whole thing this game is built to avoid.
    const g = grid([c, c, c], [c, c, c], [c, c, c], [d, d, d], [d, d, d]);
    expect(evaluate(g, 1).fixed).toBe(0);
  });

  it("adds up every line that won, not just the best one", () => {
    // Chips on the first three reels means all nine lines read chip three-of-
    // a-kind. A machine that paid only the highest line would be a different
    // and much meaner game than the paytable advertises.
    const g = grid([c, c, c], [c, c, c], [c, c, c], [d, d, d], [d, d, d]);
    expect(evaluate(g, 900).lines).toHaveLength(9);
    expect(evaluate(g, 900).fixed).toBe(3600);
  });

  it("does not pay for a run of two", () => {
    const g = grid([c, c, c], [c, c, c], [d, d, d], [d, d, d], [b, b, b]);
    expect(evaluate(g, 900).lines).toHaveLength(0);
    expect(evaluate(g, 900).fixed).toBe(0);
  });

  it("flags the jackpot and pays no multiplier for it", () => {
    const g = grid([s, s, s], [s, s, s], [s, s, s], [s, s, s], [s, s, s]);
    const result = evaluate(g, 900);
    expect(result.jackpot).toBe(true);
    expect(result.fixed).toBe(0);
  });

  it("flags the jackpot once even when all nine lines read it", () => {
    /*
     * The arrangement that could mint chips, and the reason this is a boolean
     * rather than a count. Fifteen sevens lights every payline, and a jackpot
     * paid nine times is 360% of the bank — a machine that owes more than
     * anybody ever put in it.
     */
    const g = grid([s, s, s], [s, s, s], [s, s, s], [s, s, s], [s, s, s]);
    const result = evaluate(g, 900);
    expect(result.jackpot).toBe(true);
    expect(typeof result.jackpot).toBe("boolean");
  });

  it("still pays the other lines when one of them is the jackpot", () => {
    // Sevens along the middle, bells top and bottom: one jackpot line and two
    // lines of five bells. The jackpot must not swallow the rest.
    const g = grid([b, s, b], [b, s, b], [b, s, b], [b, s, b], [b, s, b]);
    const result = evaluate(g, 900);
    expect(result.jackpot).toBe(true);
    expect(result.fixed).toBe(2 * 875 * 100);
  });

  it("names the line it paid on, so the glass can light the right one", () => {
    const g = grid([b, s, b], [b, s, b], [b, s, b], [b, s, b], [b, s, b]);
    const paid = evaluate(g, 900).lines.map((line) => line.line).sort();
    // The top and the bottom; the middle was the jackpot and pays no
    // multiplier, and every diagonal is broken by the row it crosses into.
    expect(paid).toEqual([1, 2]);
  });

  it("reports how far each winning run actually reached", () => {
    const g = grid([c, c, c], [c, c, c], [c, c, c], [d, d, d], [d, d, d]);
    for (const line of evaluate(g, 900).lines) {
      expect(line.length).toBe(3);
      expect(line.face).toBe("chip");
    }
  });
});
