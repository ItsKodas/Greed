import type { Face } from "./strip.js";

/**
 * The bonus, which is the one face that does not care about paylines.
 *
 * Everything else on this machine pays for landing in a row from the left. The
 * bonus pays for turning up at all — three of them anywhere on the fifteen
 * cells and the machine owes you a run of spins you did not pay for. That is
 * what a scatter is for: it is the one win a player can see coming from the
 * first reel, because the second one does not have to match anything.
 *
 * Counted by reel rather than by cell. With one bonus stop on the strip a reel
 * cannot show two, so today the two counts are the same number — but the strip
 * is a table somebody may retune, and a scatter that quietly starts counting
 * two stacked bonuses on one reel as two is a machine that got more generous
 * without anybody deciding it should.
 */

/** How many reels have to show one before anything happens. */
export const MIN_SCATTER = 3;

/**
 * What each count is worth, in spins.
 *
 * Steep on purpose. Three is the one a player will actually see — about once
 * in a hundred and forty spins — and four is thirty times rarer than that, so
 * it can afford to be worth half as much again without moving the return.
 */
export const BONUS_AWARDS: Record<number, number> = {
  3: 8,
  4: 12,
  5: 20,
};

/** How many reels are showing a bonus. */
export function countScatters(grid: Face[][]): number {
  let reels = 0;
  for (const column of grid) {
    if (column.includes("bonus")) {
      reels += 1;
    }
  }
  return reels;
}

/**
 * What this grid awards, in free spins. Zero is the usual answer.
 *
 * A count off the end of the table awards the most it knows about rather than
 * nothing: six reels is not a thing this machine can do, but a table read that
 * silently pays nothing for a *better* result is the wrong way round to fail.
 */
export function freeSpinsFor(scatters: number): number {
  if (scatters < MIN_SCATTER) {
    return 0;
  }
  const counts = Object.keys(BONUS_AWARDS).map(Number);
  const capped = Math.min(scatters, Math.max(...counts));
  return BONUS_AWARDS[capped] ?? 0;
}
