import { LINE_COUNT, PAYLINES, runOn } from "./paylines.js";
import type { Face } from "./strip.js";

/**
 * What each run is worth, as a multiple of the line bet.
 *
 * Tuned together with the strip weights to land the return at 90%. Neither
 * table means anything without the other, and `rtp.ts` is what keeps them
 * honest: change a number here and that test fails until the pair are back in
 * step. That is the point of it — a slot machine's generosity is not
 * something anybody should be able to alter by eye.
 *
 * Five sevens is null rather than a large number, because the jackpot is a
 * share of the bank. A multiplier here would be a second way to pay it, and
 * two ways to pay one thing is two numbers that can disagree.
 */
export const PAYS: Record<Face, Record<3 | 4 | 5, number | null>> = {
  chip: { 3: 4, 4: 22, 5: 109 },
  dice: { 3: 7, 4: 33, 5: 164 },
  spade: { 3: 11, 4: 55, 5: 273 },
  horseshoe: { 3: 18, 4: 88, 5: 438 },
  bell: { 3: 33, 4: 164, 5: 875 },
  seven: { 3: 55, 4: 328, 5: null },
};

/** One line that paid, and what it paid. */
export interface WinningLine {
  /** Index into PAYLINES, so the glass can light the right one. */
  line: number;
  face: Face;
  length: number;
  pay: number;
}

/**
 * What a grid is worth at this stake.
 *
 * `fixed` is everything the paytable owes. The jackpot is deliberately not a
 * number here: this file knows nothing about the bank, and a share of a bank
 * is not something a pure function over a grid could work out.
 */
export function evaluate(
  grid: Face[][],
  stake: number,
): { lines: WinningLine[]; fixed: number; jackpot: boolean } {
  const lines: WinningLine[] = [];
  let fixed = 0;
  let jackpot = false;

  for (let index = 0; index < LINE_COUNT; index += 1) {
    const line = PAYLINES[index] as readonly number[];
    const { face, length } = runOn(grid, line);
    if (length < 3) {
      continue;
    }
    const multiplier = PAYS[face][length as 3 | 4 | 5];
    if (multiplier === null) {
      /*
       * The jackpot. A flag rather than a tally, and the single most important
       * line in this file: fifteen sevens lights all nine paylines, and a
       * jackpot paid once per line is 360% of the bank — the one arrangement
       * in this game that could make the machine owe more than players put in.
       */
      jackpot = true;
      continue;
    }
    /*
     * The line bet is a ninth of the stake, floored. Floored rather than
     * rounded because rounding up invents chips, and this whole game is an
     * argument that nothing here invents chips.
     */
    const pay = Math.floor((multiplier * stake) / LINE_COUNT);
    fixed += pay;
    lines.push({ line: index, face, length, pay });
  }

  return { lines, fixed, jackpot };
}
