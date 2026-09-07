import type { BotSkill } from "@backroom/core";
import type { Card, Rank } from "./cards.js";
import { value } from "./hand.js";

export type Move = "hit" | "stand" | "double" | "split";

/**
 * What a bot does with a hand.
 *
 * Everything here is decided from the dealer's **upcard** alone. A bot holds a
 * reference to the same table a player does, so it could read the hole card
 * and never lose — the argument this function takes is the guard against that,
 * and it is a number rather than a table for exactly that reason.
 */

/** The dealer's upcard as a number, aces counted high, tens flattened. */
export function upcardValue(card: Card): number {
  if (card.rank === "A") {
    return 11;
  }
  const tens: Rank[] = ["10", "J", "Q", "K"];
  return tens.includes(card.rank) ? 10 : Number(card.rank);
}

/**
 * Basic strategy, minus splitting — there is no splitting at this table, so
 * there is no pair row to write.
 *
 * The three skills are three different players rather than three amounts of
 * noise added to one. An easy bot plays the dealer's own rules, which is a
 * real way beginners play and is genuinely worse; a normal bot plays basic
 * strategy but never doubles, which is how most people actually play; a hard
 * bot plays it properly.
 */
export function decide(options: {
  cards: readonly Card[];
  upcard: number;
  /** Whether doubling is still allowed — first two cards only. */
  canDouble: boolean;
  /** Whether this hand is a pair that may still be split. */
  canSplit?: boolean;
  skill: BotSkill;
}): Move {
  const { cards, upcard, skill } = options;

  /*
   * Pairs first, because splitting is a decision about the hand you hold
   * rather than the total it makes: sixteen made of two eights is the worst
   * hand at the table, and two hands of eight are two ordinary ones.
   *
   * Graded the way doubling is. An easy bot never splits, because it has never
   * heard of it. A normal bot splits aces and eights — the two every player
   * knows, and most of the value there is in splitting at all. A hard bot
   * plays the whole chart.
   */
  if (options.canSplit === true && skill !== "easy" && cards.length === 2) {
    const pair = pairValue(cards);
    if (pair !== null && shouldSplit(pair, upcard, skill)) {
      return "split";
    }
  }
  const { total, soft } = value(cards);
  // Doubling is a decision only a hard bot makes, and only when it is legal.
  const canDouble = options.canDouble && skill === "hard";

  if (skill === "easy") {
    // The dealer's own rule, played by someone who has not been told there is
    // a better one: hit to seventeen and stop, soft or hard.
    return total < 17 ? "hit" : "stand";
  }

  if (soft) {
    if (total >= 19) {
      return "stand";
    }
    if (total === 18) {
      if (upcard >= 3 && upcard <= 6) {
        return canDouble ? "double" : "stand";
      }
      // Soft eighteen is the hand people get wrong: it stands against a weak
      // upcard and a seven or eight, and hits against nine, ten and an ace.
      return upcard === 2 || upcard === 7 || upcard === 8 ? "stand" : "hit";
    }
    if (total === 17 && upcard >= 3 && upcard <= 6) {
      return canDouble ? "double" : "hit";
    }
    if (total >= 15 && upcard >= 4 && upcard <= 6) {
      return canDouble ? "double" : "hit";
    }
    if (total >= 13 && upcard >= 5 && upcard <= 6) {
      return canDouble ? "double" : "hit";
    }
    return "hit";
  }

  if (total >= 17) {
    return "stand";
  }
  if (total >= 13) {
    // Stiff against a bust card, hit against anything that beats you standing.
    return upcard <= 6 ? "stand" : "hit";
  }
  if (total === 12) {
    return upcard >= 4 && upcard <= 6 ? "stand" : "hit";
  }
  if (total === 11) {
    return canDouble ? "double" : "hit";
  }
  if (total === 10) {
    return canDouble && upcard <= 9 ? "double" : "hit";
  }
  if (total === 9) {
    return canDouble && upcard >= 3 && upcard <= 6 ? "double" : "hit";
  }
  return "hit";
}

/** The value both cards share, or null when they are not a pair at all. */
function pairValue(cards: readonly Card[]): number | null {
  const [first, second] = cards;
  if (first === undefined || second === undefined) {
    return null;
  }
  const left = value([first]).total;
  const right = value([second]).total;
  return left === right ? left : null;
}

/**
 * Whether a pair is worth splitting against what the dealer is showing.
 *
 * The ordinary chart. Aces and eights always; tens, fives and fours never —
 * twenty and eleven are good hands already, and two fours are worse apart than
 * together. Everything in between depends on whether the dealer looks weak.
 */
function shouldSplit(pair: number, upcard: number, skill: BotSkill): boolean {
  if (pair === 11 || pair === 8) {
    return true;
  }
  if (skill !== "hard") {
    return false;
  }
  if (pair === 10 || pair === 5 || pair === 4) {
    return false;
  }
  if (pair === 9) {
    // Not against a seven: eighteen already beats the seventeen the dealer is
    // likeliest to make, and splitting would give that up twice over.
    return (upcard >= 2 && upcard <= 6) || upcard === 8 || upcard === 9;
  }
  if (pair === 7) {
    return upcard >= 2 && upcard <= 7;
  }
  if (pair === 6) {
    return upcard >= 2 && upcard <= 6;
  }
  // Twos and threes: worth splitting while the dealer still has to draw.
  return upcard >= 2 && upcard <= 7;
}

/** What a bot puts on the felt, which is the same every hand. */
export function betFor(skill: BotSkill): number {
  return skill === "hard" ? 500 : 250;
}

/** Long enough to look like a decision, short enough not to hold the table. */
export function thinkingTime(skill: BotSkill): number {
  const base = skill === "easy" ? 600 : 800;
  return base + Math.floor(Math.random() * 700);
}
