import type { BotSkill } from "@backroom/core";
import { CATEGORIES } from "./hand.js";
import { best } from "./hand.js";
import { rankValue } from "./cards.js";
import type { Seat, Table } from "./table.js";

/**
 * Somebody to play against at a table playing for nothing.
 *
 * Only ever there — chips are only won from real people, so a bot exists to
 * make a for-fun table worth sitting at on your own and for nothing else. It
 * is refused at every other kind of table by the table itself.
 *
 * The strategy is deliberately plain. It is not trying to be hard to beat: it
 * is trying to be somebody at the table, which means folding rubbish, paying
 * for a real hand, and putting in a raise often enough that the betting does
 * something. A bot that called everything would make every hand a showdown,
 * and one that folded everything would make the game a walkover — both of
 * which are worse than losing to it.
 */

/** How long a bot appears to think, by how good it is meant to be. */
export function thinkingTime(skill: BotSkill): number {
  const base = skill === "easy" ? 700 : skill === "hard" ? 1_100 : 900;
  return base + Math.floor(Math.random() * 600);
}

/**
 * How good this hand looks, from nothing to certain.
 *
 * Two different questions wearing one answer: before the flop there is no hand
 * yet, only two cards worth playing or not, and after it there is a hand that
 * can simply be read. Both come back on the same scale so the betting below
 * only has to know one thing.
 */
export function strength(seat: Seat, board: readonly { rank: string }[]): number {
  const hole = seat.hole;
  if (hole.length < 2) {
    return 0;
  }
  const [one, two] = hole as [NonNullable<(typeof hole)[0]>, NonNullable<(typeof hole)[1]>];

  if (board.length === 0) {
    /*
     * Preflop, on the three things that actually decide it: a pair, how high
     * the cards are, and whether they can make a straight or a flush together.
     * Not a lookup table of a hundred and sixty-nine hands — this only has to
     * be good enough to fold junk and pay for aces.
     */
    const high = rankValue(one.rank);
    const low = rankValue(two.rank);
    const top = Math.max(high, low);
    const bottom = Math.min(high, low);
    if (high === low) {
      // Deuces are a hand; aces are a very good one.
      return 0.55 + ((top - 2) / 12) * 0.45;
    }
    const suited = one.suit === two.suit ? 0.08 : 0;
    const gap = top - bottom;
    const connected = gap <= 4 ? (5 - gap) * 0.03 : 0;
    return Math.min(0.54, ((top - 2) / 12) * 0.34 + ((bottom - 2) / 12) * 0.1 + suited + connected);
  }

  /*
   * With a board there is a hand to read, so read it. The category alone is
   * enough here: the difference between two pair and trips changes how this
   * bets, and the difference between one two-pair and another does not.
   */
  const cards = [...hole, ...board];
  if (cards.length < 5) {
    return 0.4;
  }
  const score = best(cards as Parameters<typeof best>[0]);
  const rank = CATEGORIES.indexOf(score.category);
  return Math.min(1, 0.3 + (rank / (CATEGORIES.length - 1)) * 0.7);
}

/** A move, and what it would raise to if it is a raise. */
export interface Choice {
  move: "fold" | "check" | "call" | "raise";
  to?: number;
}

/**
 * What this bot does with the hand in front of it.
 *
 * Exported so it can be tested without a table dealing itself underneath the
 * test — which is the only way to ask "what does it do holding this?" and get
 * the same answer twice.
 */
export function decide(
  seat: Seat,
  table: Pick<Table, "board" | "bigBlind">,
  owed: number,
  minRaiseTo: number,
  maxRaiseTo: number,
  skill: BotSkill,
  random: () => number = Math.random,
): Choice {
  const how = strength(seat, table.board);
  /*
   * An easy bot pays too much to see a hand and a hard one does not. This is
   * the whole of the difference between them, because it is the decision the
   * game is actually made of.
   */
  const nerve = skill === "easy" ? 0.16 : skill === "hard" ? -0.06 : 0.05;
  const worth = how + nerve;

  const canRaise = maxRaiseTo > minRaiseTo - 1 && seat.stack > owed;
  // A raise now and then, so the betting is not all calling. Strong hands
  // raise often; the occasional weak one keeps it from being a tell.
  const raising = canRaise && (worth > 0.7 ? random() < 0.55 : worth > 0.5 ? random() < 0.2 : random() < 0.04);

  if (raising) {
    /*
     * Between the smallest legal raise and about the pot. Rounded to a blind
     * because a raise to 237 reads as a machine, and cut to what the seat can
     * actually cover.
     */
    const reach = minRaiseTo + Math.floor(random() * 3) * table.bigBlind * 2;
    const to = Math.min(maxRaiseTo, Math.max(minRaiseTo, reach));
    return { move: "raise", to };
  }

  if (owed === 0) {
    return { move: "check" };
  }

  /*
   * What it costs against what it is worth. A hand that is worth something
   * pays a small price and folds a big one, which is most of what folding is.
   */
  const price = owed / Math.max(1, owed + seat.stack);
  if (worth < 0.28 || (price > 0.32 && worth < 0.62)) {
    return { move: "fold" };
  }
  return { move: "call" };
}
