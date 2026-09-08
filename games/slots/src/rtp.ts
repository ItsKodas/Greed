import { LINE_COUNT } from "./paylines.js";
import { PAYS } from "./paytable.js";
import { BONUS_AWARDS, MIN_SCATTER } from "./scatter.js";
import { PAYING_FACES, STOPS, WEIGHTS } from "./strip.js";

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
 *
 * This is not what the machine returns. It is what the *paytable* returns, and
 * since the bonus arrived that is only part of it — `machineRtp` adds the free
 * spins, and 90% is a claim about that.
 */
export function lineRtp(): number {
  let total = 0;
  for (const face of PAYING_FACES) {
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
 * The paytable's return as a constant, for anything that should not recompute
 * it.
 *
 * Written out so that a change to the strip or the paytable fails a test
 * rather than silently moving the number every caller quotes.
 */
export const LINE_RTP = 0.8502731919288635;

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

/**
 * The chance one reel stops showing a bonus.
 *
 * A reel is a window on three consecutive stops, so a single bonus stop is
 * visible from three of the thirty-two places the reel can stop. Exact, and
 * the reason the strip holds exactly one: the number of stops is the only dial
 * on how often the bonus comes round, and it is a coarse one.
 */
export function scatterOdds(): number {
  return (WEIGHTS.bonus * 3) / STOPS;
}

/**
 * The chance a spin shows a bonus on exactly this many reels.
 *
 * Binomial, because the five reels are independent and each either shows one
 * or does not. That "or does not" is only true while the strip holds a single
 * bonus stop — two adjacent ones would let a reel show two, and this would
 * quietly start understating the good spins.
 */
export function scatterOddsOn(reels: number): number {
  const q = scatterOdds();
  const choose = factorial(5) / (factorial(reels) * factorial(5 - reels));
  return choose * q ** reels * (1 - q) ** (5 - reels);
}

function factorial(n: number): number {
  let total = 1;
  for (let k = 2; k <= n; k += 1) {
    total *= k;
  }
  return total;
}

/** The chance a spin triggers the bonus at all. About one in a hundred and forty. */
export function bonusOdds(): number {
  let total = 0;
  for (let reels = MIN_SCATTER; reels <= 5; reels += 1) {
    total += scatterOddsOn(reels);
  }
  return total;
}

/**
 * Free spins earned per paid spin, averaged.
 *
 * The number that connects the two halves of the return: every free spin plays
 * the same reels for nothing, so the machine gives back the paytable's return
 * one and a bit times per stake rather than once.
 *
 * Free spins deliberately do not retrigger. If they did this would be a
 * geometric series rather than a sum — convergent, but a machine whose return
 * depends on a series converging is one nobody can check by hand.
 */
export function freeSpinsPerSpin(): number {
  let total = 0;
  for (let reels = MIN_SCATTER; reels <= 5; reels += 1) {
    total += scatterOddsOn(reels) * (BONUS_AWARDS[reels] ?? 0);
  }
  return total;
}

/**
 * What the machine gives back, both halves together.
 *
 * This is the 90%, and it is the only number here that is a promise to a
 * player. The paytable alone returns about 85%; the free spins carry the rest.
 * Retuning either half without the other moves this, which is what the test
 * guarding it is for.
 */
export function machineRtp(): number {
  return lineRtp() * (1 + freeSpinsPerSpin());
}
