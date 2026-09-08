import { describe, expect, it } from "vitest";
import { PAYS } from "./paytable.js";
import {
  bonusOdds,
  freeSpinsPerSpin,
  jackpotOdds,
  LINE_RTP,
  lineRtp,
  machineRtp,
  scatterOdds,
  scatterOddsOn,
} from "./rtp.js";
import { PAYING_FACES, STOPS, WEIGHTS } from "./strip.js";

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
    // The machine, not the paytable. Two halves add up to this: the lines pay
    // about 85%, and the free spins the bonus hands out carry the rest.
    expect(machineRtp()).toBeCloseTo(0.9, 4);
  });

  it("gives back about 85% of it across the paylines alone", () => {
    // Worth pinning separately. If somebody retunes the paytable back to 90%
    // without noticing the bonus, the machine returns 95% and the bank drains.
    expect(lineRtp()).toBeCloseTo(0.85, 3);
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
    for (const face of PAYING_FACES) {
      const p = WEIGHTS[face] / STOPS;
      for (const length of [3, 4, 5] as const) {
        const multiplier = PAYS[face][length];
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
    expect(1 - machineRtp()).toBeCloseTo(0.1, 4);
  });

  it("counts the free spins as return, because that is what they are", () => {
    /*
     * The whole reason the paytable came down when the bonus went in. Summed
     * again here from the odds and the awards, independently of rtp.ts.
     */
    const q = scatterOdds();
    const choose = [1, 5, 10, 10, 5, 1];
    let expected = 0;
    for (const [reels, spins] of [
      [3, 8],
      [4, 12],
      [5, 20],
    ] as const) {
      expected += (choose[reels] as number) * q ** reels * (1 - q) ** (5 - reels) * spins;
    }
    expect(freeSpinsPerSpin()).toBeCloseTo(expected, 12);
    expect(machineRtp()).toBeCloseTo(lineRtp() * (1 + freeSpinsPerSpin()), 12);
  });

  it("gives back less than it takes on the paytable alone", () => {
    // If this ever went above 1 the bank would drain no matter how rarely the
    // jackpot landed, and the machine would be a chip faucet.
    expect(lineRtp()).toBeLessThan(1);
  });

  it("triggers the bonus about once in a hundred and forty spins", () => {
    /*
     * The number the whole feature hangs off. Two bonus stops instead of one
     * made it one spin in eleven, which is not a bonus — it is the game.
     */
    const spins = Math.round(1 / bonusOdds());
    expect(spins).toBeGreaterThan(120);
    expect(spins).toBeLessThan(165);
  });

  it("counts a reel as showing a bonus three stops in thirty-two", () => {
    // A reel is a window on three consecutive stops, so one stop is visible
    // from three of the thirty-two places it can come to rest.
    expect(scatterOdds()).toBeCloseTo(3 / 32, 12);
    // And the five reels are independent, so the counts are binomial.
    let all = 0;
    for (let reels = 0; reels <= 5; reels += 1) {
      all += scatterOddsOn(reels);
    }
    expect(all).toBeCloseTo(1, 12);
  });

  it("hits the jackpot about once in fifteen thousand spins", () => {
    const spins = Math.round(1 / jackpotOdds());
    expect(spins).toBeGreaterThan(14_000);
    expect(spins).toBeLessThan(17_000);
  });
});
