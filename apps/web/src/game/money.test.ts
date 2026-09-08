import { describe, expect, it } from "vitest";
import { compact, exact } from "./money.js";

describe("a figure somebody is reading", () => {
  it("is written out in full", () => {
    expect(exact(10_440)).toBe("10,440");
    expect(exact(1_044_000)).toBe("1,044,000");
    expect(exact(0)).toBe("0");
  });
});

describe("a figure somebody is glancing at", () => {
  it("leaves four digits alone", () => {
    // "9.99K" is the same width as "9,990" and says less, so there is nothing
    // to buy by shortening down here.
    expect(compact(0)).toBe("0");
    expect(compact(950)).toBe("950");
    expect(compact(9_999)).toBe("9,999");
  });

  it("shortens from ten thousand", () => {
    expect(compact(10_000)).toBe("10.0K");
    expect(compact(10_440)).toBe("10.4K");
    expect(compact(54_200)).toBe("54.2K");
    expect(compact(440_000)).toBe("440K");
  });

  it("shortens millions and beyond", () => {
    expect(compact(1_044_000)).toBe("1.04M");
    expect(compact(5_670_000)).toBe("5.67M");
    expect(compact(98_765_432)).toBe("98.8M");
    expect(compact(4_000_000_000)).toBe("4.00B");
    expect(compact(7_500_000_000_000)).toBe("7.50T");
  });

  it("keeps three significant figures, so the width barely moves", () => {
    // The whole reason for this: it sits in a fixed pill beside somebody's
    // face, and a number that changes width every spin makes the pill jump.
    for (const value of [10_000, 99_999, 100_000, 999_999, 1_000_000, 987_654_321]) {
      expect(compact(value).length).toBeLessThanOrEqual(6);
    }
  });

  it("moves up a scale rather than rounding out of the one it is in", () => {
    /*
     * 999,999 to three significant figures is 1000K — which is wrong, and
     * wider than the number it replaced. It is 1.00M.
     */
    expect(compact(999_999)).toBe("1.00M");
    expect(compact(999_999_999)).toBe("1.00B");
  });

  it("holds its width with trailing zeros rather than dropping them", () => {
    // "1.0M" and "1.00M" flicker against each other in a pill; only one width.
    expect(compact(1_000_000)).toBe("1.00M");
    expect(compact(20_000)).toBe("20.0K");
  });

  it("keeps a debt negative rather than losing the sign", () => {
    expect(compact(-54_200)).toBe("-54.2K");
    expect(compact(-1_500_000)).toBe("-1.50M");
  });

  it("says nothing rather than NaN when handed something that is not a number", () => {
    // The balance comes off the wire, and a pill reading "NaNK" is worse than
    // a pill reading zero.
    expect(compact(Number.NaN)).toBe("0");
    expect(compact(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
