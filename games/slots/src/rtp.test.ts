import { describe, expect, it } from "vitest";
import { PAYS } from "./paytable.js";
import { jackpotOdds, LINE_RTP, lineRtp } from "./rtp.js";
import { STOPS, WEIGHTS } from "./strip.js";

/**
 * The return, asserted rather than assumed.
 *
 * This is the test that stops somebody making the machine generous — or mean —
 * by changing one multiplier and looking at it. The number is computable in
 * closed form, because each payline reads one face per reel and the reels are
 * independent, so there is no simulation here and nothing left to luck.
 * Eighteen terms, summed.
 *
 * The alternative was enumerating all 32^5 grids, 33.5 million of them, on
 * every commit. Going from three reels to five made this better, not worse.
 */
describe("the return to player", () => {
  it("is 90%", () => {
    expect(lineRtp()).toBeCloseTo(0.9, 4);
  });

  it("matches the constant the rest of the code quotes", () => {
    expect(lineRtp()).toBeCloseTo(LINE_RTP, 12);
  });

  it("is computed from the strip and the paytable, not written down", () => {
    /*
     * Sums it again here, independently of rtp.ts, so the two have to agree.
     * If lineRtp() were ever quietly replaced by a hard-coded number to make a
     * failing test pass, this is what catches it.
     */
    let expected = 0;
    for (const [face, weight] of Object.entries(WEIGHTS)) {
      const p = weight / STOPS;
      for (const length of [3, 4, 5] as const) {
        const multiplier = PAYS[face as keyof typeof PAYS][length];
        if (multiplier === null) {
          continue;
        }
        expected += (length === 5 ? p ** 5 : p ** length * (1 - p)) * multiplier;
      }
    }
    expect(lineRtp()).toBeCloseTo(expected, 12);
  });

  it("leaves a tenth over, which is exactly what funds the jackpot", () => {
    // Not a house edge. Every chip withheld here goes back out as jackpot,
    // which is why the total return approaches 100% and the bank circulates
    // rather than fills.
    expect(1 - lineRtp()).toBeCloseTo(0.1, 4);
  });

  it("gives back less than it takes on the paytable alone", () => {
    // If this ever went above 1 the bank would drain no matter how rarely the
    // jackpot landed, and the machine would be a chip faucet.
    expect(lineRtp()).toBeLessThan(1);
  });

  it("hits the jackpot about once in fifteen thousand spins", () => {
    const spins = Math.round(1 / jackpotOdds());
    expect(spins).toBeGreaterThan(14_000);
    expect(spins).toBeLessThan(17_000);
  });
});
