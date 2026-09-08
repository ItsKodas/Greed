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

export type Face = "tumbler" | "cigar" | "dice" | "spade" | "diamond" | "seven" | "bonus";

/**
 * Every face that pays for landing in a row.
 *
 * The bonus is not one of them: it pays for turning up anywhere at all, which
 * is a different question, asked in scatter.ts. Splitting the type is what
 * stops the paytable ever being asked what three bonuses in a row are worth —
 * a question with no sensible answer that would otherwise be a runtime
 * undefined rather than a red squiggle.
 */
export type PayingFace = Exclude<Face, "bonus">;

/** The whole loop, and the denominator of every probability in this game. */
export const STOPS = 32;

/** Commonest first, which is also cheapest first. */
export const FACES: readonly Face[] = [
  "tumbler",
  "cigar",
  "dice",
  "spade",
  "diamond",
  "seven",
  "bonus",
];

/** The same list without the scatter, for anything reading the paytable. */
export const PAYING_FACES: readonly PayingFace[] = FACES.filter(
  (face): face is PayingFace => face !== "bonus",
);

/**
 * How many of the 32 stops each face holds.
 *
 * Tuned against the paytable to land the return at 90%. Moving one without
 * retuning the other breaks that, which is why `rtp.ts` asserts the return
 * rather than trusting this table.
 */
export const WEIGHTS: Record<Face, number> = {
  tumbler: 8,
  cigar: 7,
  dice: 6,
  spade: 4,
  diamond: 3,
  seven: 3,
  /*
   * One stop, and the whole feel of the bonus comes out of that number. A reel
   * covers three consecutive stops, so a single stop shows up on three windows
   * in thirty-two — and three reels of five doing that is about one spin in a
   * hundred and forty. Two stops made it one in eleven, which is not a bonus,
   * it is the game.
   *
   * It came out of the tumbler's nine rather than being added to the strip,
   * because thirty-two stops is what makes every probability here an exact
   * fraction.
   */
  bonus: 1,
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
