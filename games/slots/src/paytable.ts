import { LINE_COUNT, PAYLINES, runOn } from "./paylines.js";
import type { Face, PayingFace } from "./strip.js";

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
 *
 * There is no row for the bonus, and the type is what enforces that: it pays
 * for turning up anywhere rather than for landing in a row, so asking this
 * table what a row of them is worth is a question with no answer.
 *
 * These went up by about an eighth when the bonus arrived. Free spins are
 * return the paytable does not know it is giving, so the paytable had to give
 * less to keep the machine on 90% — `machineRtp` in rtp.ts is what holds the
 * two halves to that total.
 */
export const PAYS: Record<PayingFace, Record<3 | 4 | 5, number | null>> = {
  tumbler: { 3: 4, 4: 26, 5: 122 },
  cigar: { 3: 8, 4: 37, 5: 183 },
  dice: { 3: 12, 4: 61, 5: 305 },
  spade: { 3: 20, 4: 98, 5: 485 },
  diamond: { 3: 37, 4: 183, 5: 977 },
  seven: { 3: 61, 4: 366, 5: null },
};

/** One line that paid, and what it paid. */
export interface WinningLine {
  /** Index into PAYLINES, so the glass can light the right one. */
  line: number;
  /** Never the bonus: that one is counted as a scatter, not read along a line. */
  face: PayingFace;
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
  /**
   * How many of the nine lines were bought, from the top of the list.
   *
   * A line nobody bet on does not pay, however it lands — which is the whole
   * meaning of choosing fewer. The stake is split across the lines that were
   * bought, so the line bet goes *up* as the count comes down and a spin on
   * one line is not a spin on nine for a ninth of the money.
   */
  played: number = LINE_COUNT,
): { lines: WinningLine[]; fixed: number; jackpot: boolean } {
  const lines: WinningLine[] = [];
  let fixed = 0;
  let jackpot = false;
  const bought = Math.max(1, Math.min(LINE_COUNT, Math.floor(played)));

  for (let index = 0; index < bought; index += 1) {
    const line = PAYLINES[index] as readonly number[];
    const { face, length } = runOn(grid, line);
    if (length < 3) {
      continue;
    }
    if (face === "bonus") {
      /*
       * Three bonuses happening to land in a row from the left. They are
       * already being counted as scatters, and paying them here as well would
       * pay the same three symbols twice — with a multiplier this table does
       * not have.
       */
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
     * The line bet is the stake split across the lines that were bought,
     * floored. Floored rather than rounded because rounding up invents chips,
     * and this whole game is an argument that nothing here invents chips.
     */
    const pay = Math.floor((multiplier * stake) / bought);
    fixed += pay;
    lines.push({ line: index, face, length, pay });
  }

  return { lines, fixed, jackpot };
}
