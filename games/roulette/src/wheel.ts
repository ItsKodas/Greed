import { randomInt } from "node:crypto";

/**
 * The wheel: thirty-seven pockets, one zero.
 *
 * Single zero rather than double, which is a decision about the players. The
 * second zero exists to double the house edge from 2.7% to 5.26%, and the only
 * thing that edge does here is fill a bank that needs to not go bust. It does
 * that at 2.7% while being twice as kind to everybody playing.
 */

/** How many pockets there are, which is the divisor in every payout. */
export const POCKETS = 37;

/**
 * The numbers in the order they sit on the wheel, clockwise from zero.
 *
 * Not the same thing as counting to thirty-six, and the difference matters. A
 * real wheel is laid out so colours alternate and so that numbers close
 * together on the cloth are far apart on the rim — which is what makes a ball
 * landing "one past" a number mean anything at all. A wheel drawn in counting
 * order would be a picture that lies about where the ball went.
 */
export const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

/** The red numbers, and so, by what is missing, the black ones. */
export const RED: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK: ReadonlySet<number> = new Set(
  WHEEL.filter((n) => n !== 0 && !RED.has(n)),
);

export type Colour = "red" | "black";

/**
 * What colour a pocket is, or nothing at all for the zero.
 *
 * Zero being colourless is the entire house edge. Red, black, odd, even, high
 * and low all lose to it, and a zero quietly counted as one of them would hand
 * the edge straight back and leave the bank flat forever.
 */
export function colourOf(pocket: number): Colour | null {
  if (pocket === 0) return null;
  return RED.has(pocket) ? "red" : "black";
}

/**
 * Where the ball lands.
 *
 * From a cryptographic source by default, because this is the one number in
 * the building a player could otherwise learn to predict: a table hands every
 * watcher its whole result every spin, which is exactly the run of
 * observations needed to recover `Math.random`'s state and call the next one.
 *
 * The source picks an index rather than a pocket, so a test can say "the ball
 * went in the third pocket" without knowing which number that is, and so the
 * wheel's order stays the only place that mapping lives.
 */
export function spin(pick: (pockets: number) => number = randomInt): number {
  return WHEEL[pick(POCKETS)] as number;
}
