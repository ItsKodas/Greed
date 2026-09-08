import type { Face } from "./strip.js";

/**
 * The nine lines a spin is read along.
 *
 * Nine rather than twenty because a payline nobody can trace is not a feature.
 * At 375px each of these can be drawn across the glass and followed by eye,
 * which is the whole reason a payline is better than a count of matches: the
 * player can see why they were paid.
 *
 * Each entry is one row index per reel, top row 0. The middle line comes
 * first because it is the one people look at, and somebody reading "line 1"
 * off the screen should find it where they expect.
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // the middle
  [0, 0, 0, 0, 0], // the top
  [2, 2, 2, 2, 2], // the bottom
  [0, 1, 2, 1, 0], // the V
  [2, 1, 0, 1, 2], // the peak
  [0, 0, 1, 2, 2], // falling
  [2, 2, 1, 0, 0], // rising
  [1, 0, 0, 0, 1], // the arch
  [1, 2, 2, 2, 1], // the trough
];

export const LINE_COUNT = PAYLINES.length;

/**
 * What is on this line, and how far it runs unbroken from the left.
 *
 * Left to right from reel 1, which is the rule that makes a slot machine
 * legible: four sevens starting on reel 2 is a near miss and reads as one.
 * Paying it would put a winning line on the glass that the player cannot see,
 * which is worse than not paying at all — a payout nobody can account for is
 * indistinguishable from a bug.
 */
export function runOn(
  grid: Face[][],
  line: readonly number[],
): { face: Face; length: number } {
  const first = grid[0]?.[line[0] as number] as Face;
  let length = 1;
  for (let reel = 1; reel < line.length; reel += 1) {
    if (grid[reel]?.[line[reel] as number] !== first) {
      break;
    }
    length += 1;
  }
  return { face: first, length };
}
