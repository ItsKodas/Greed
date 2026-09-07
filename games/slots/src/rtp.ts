import { LINE_COUNT } from "./paylines.js";
import { PAYS } from "./paytable.js";
import { FACES, STOPS, WEIGHTS } from "./strip.js";

/**
 * What this machine gives back, worked out rather than measured.
 *
 * A payline reads one face per reel, the reels are independent and they share
 * a strip, so the chance of a run of exactly k from the left is a closed form:
 * p^k * (1-p) for a run of 3 or 4 that something breaks, and p^5 for a full
 * line that nothing does. That makes the return a sum of eighteen terms
 * instead of an average over a simulation, so the test guarding it is exact
 * and costs nothing to run.
 *
 * Per line and per spin are the same number, which is worth seeing rather than
 * taking on trust: nine lines each staking a ninth of the stake return nine
 * times a ninth of it.
 */
export function lineRtp(): number {
  let total = 0;
  for (const face of FACES) {
    const p = WEIGHTS[face] / STOPS;
    for (const length of [3, 4, 5] as const) {
      const multiplier = PAYS[face][length];
      if (multiplier === null) {
        // The jackpot pays from the bank rather than the paytable. It is what
        // the missing tenth is for.
        continue;
      }
      total += (length === 5 ? p ** 5 : p ** length * (1 - p)) * multiplier;
    }
  }
  return total;
}

/**
 * The return as a constant, for anything that should not recompute it.
 *
 * Written out so that a change to the strip or the paytable fails a test
 * rather than silently moving the number every caller quotes.
 */
export const LINE_RTP = 0.8999724686145782;

/**
 * The chance a spin lights at least one jackpot line.
 *
 * Nine times the per-line chance, which slightly overstates it — two lines can
 * both read five sevens off one grid, and this counts that twice. Overstating
 * is the safe direction: it makes the jackpot look commoner than it is when
 * sizing the bank, never rarer.
 */
export function jackpotOdds(): number {
  const p = WEIGHTS.seven / STOPS;
  return p ** 5 * LINE_COUNT;
}
