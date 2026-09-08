/**
 * What is painted on the reels.
 *
 * One strip, shared by all five reels. Five different strips is what a real
 * machine does, and it buys nothing here: the arithmetic stays exact and the
 * tuning stays legible with one, and every extra strip is another set of
 * weights somebody has to keep in step with the paytable.
 *
 * Called a face rather than a symbol because `Symbol` is a JavaScript global,
 * and a type that shadows one produces error messages about the wrong thing.
 */

export type Face = "chip" | "dice" | "spade" | "horseshoe" | "bell" | "seven";

/** The whole loop, and the denominator of every probability in this game. */
export const STOPS = 32;

/** Commonest first, which is also cheapest first. */
export const FACES: readonly Face[] = [
  "chip",
  "dice",
  "spade",
  "horseshoe",
  "bell",
  "seven",
];

/**
 * How many of the 32 stops each face holds.
 *
 * Tuned against the paytable to land the return at 90%. Moving one without
 * retuning the other breaks that, which is why `rtp.ts` asserts the return
 * rather than trusting this table.
 */
export const WEIGHTS: Record<Face, number> = {
  chip: 9,
  dice: 7,
  spade: 6,
  horseshoe: 4,
  bell: 3,
  seven: 3,
};

/** The stops laid out in order, so a reel can be read as a window on it. */
export const STRIP: readonly Face[] = FACES.flatMap((face) =>
  Array.from({ length: WEIGHTS[face] }, () => face),
);

/**
 * Five columns of three, each a window of three consecutive stops.
 *
 * Consecutive rather than three independent draws, because the rows above and
 * below the payline are the reel's neighbours and a near miss has to be a real
 * one. Drawing them separately would show a player a row of sevens that was
 * never on the reel — which is the same lie as dealing a card that is not in
 * the deck, and reads as one.
 */
export function drawGrid(random: () => number): Face[][] {
  return Array.from({ length: 5 }, () => {
    /*
     * The modulo is not belt and braces. Math.random is specified as [0, 1),
     * but this takes any function, and a scripted one handing over 1 exactly
     * would index off the end of the strip — an undefined face, which renders
     * as a blank reel rather than throwing anything anybody would notice.
     */
    const at = Math.floor(random() * STOPS) % STOPS;
    return [0, 1, 2].map((offset) => STRIP[(at + offset) % STOPS] as Face);
  });
}
