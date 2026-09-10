import type { BotSkill } from "@backroom/core";
import { CHIPS } from "./bank.js";
import { SPOTS, type Spot } from "./spots.js";

/**
 * What a bot puts on the cloth.
 *
 * Bots exist for one reason: a for-fun table is worth sitting at on your own.
 * They never sit at a table playing for chips, so none of this needs to be
 * good — it needs to look like somebody is playing. What it must not do is
 * look like a machine, which is why the chip and the spot both move around.
 */

/** The kinds a bot will actually touch, weighted by how often people bet them. */
const TASTE: Record<BotSkill, readonly string[]> = {
  // Sticks to the outside, the way somebody who has just sat down does.
  easy: ["even", "even", "even", "dozen", "column", "straight"],
  normal: ["even", "even", "dozen", "column", "street", "corner", "split", "straight"],
  // Spreads chips across the inside, where the interesting shapes are.
  hard: ["corner", "split", "street", "six", "straight", "straight", "even", "dozen"],
};

/** How many chips a bot puts down in one window. */
const PILES: Record<BotSkill, number> = { easy: 1, normal: 2, hard: 3 };

/**
 * One chip, somewhere plausible.
 *
 * Returns nothing when the bot has already had its go this window, which is
 * what stops a bot burying the cloth under chips while a person is deciding.
 */
export function botBet(
  skill: BotSkill,
  already: number,
  purse: number,
  random: () => number = Math.random,
): { spotId: string; chips: number } | null {
  if (already >= PILES[skill]) {
    return null;
  }
  const kinds = TASTE[skill];
  const kind = kinds[Math.floor(random() * kinds.length)] as string;
  const options: Spot[] = [...SPOTS.values()].filter((one) => one.kind === kind);
  const spot = options[Math.floor(random() * options.length)];
  if (spot === undefined) {
    return null;
  }
  /*
   * Small chips, and never more than the purse holds. A bot that shoved would
   * make the table about the bot, and the point of it is to make the table
   * look busy while somebody else plays.
   */
  const affordable = CHIPS.filter((chip) => chip <= purse && chip <= 500);
  const chip = affordable[Math.floor(random() * affordable.length)];
  return chip === undefined ? null : { spotId: spot.id, chips: chip };
}

/** How long a bot appears to think before a chip lands. */
export function thinkingTime(random: () => number = Math.random): number {
  return 700 + Math.floor(random() * 1_800);
}
