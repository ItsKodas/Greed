import type { Numbers } from "./jar.js";

/** What a jar does with no upgrades on it. */
export const BASE: Numbers = { brim: 1500, trickle: 60, scoop: 25 };

/**
 * How much collecting chips is worth in favours.
 *
 * Favours come from chips collected rather than from taps, and that is not a
 * detail. A per-tap favour would let an autoclicker on a dry jar farm the
 * whole ladder for free, in silence, having collected nothing. Tied to chips,
 * favour income is metered by the trickle exactly as chip income is.
 */
export const FAVOUR_PER_CHIPS = 20;

export interface Upgrade {
  id: string;
  name: string;
  favours: number;
  brim: number;
  trickle: number;
  scoop: number;
}

/**
 * The ladder, cheapest first.
 *
 * Each of the first three raises exactly one number, so what a player is
 * choosing between is legible: trickle compounds over the rest of the session,
 * scoop only makes the next few minutes feel better, and brim only pays if you
 * mean to walk away.
 */
export const UPGRADES: readonly Upgrade[] = [
  { id: "glass", name: "A cleaner glass", favours: 15, brim: 0, trickle: 0, scoop: 10 },
  { id: "spot", name: "A spot nearer the door", favours: 40, brim: 0, trickle: 20, scoop: 0 },
  { id: "stool", name: "The good stool", favours: 80, brim: 750, trickle: 0, scoop: 0 },
  { id: "name", name: "Your name behind the bar", favours: 140, brim: 750, trickle: 20, scoop: 15 },
];

const BY_ID = new Map(UPGRADES.map((up) => [up.id, up]));

/**
 * What a jar's numbers are, given what is bought.
 *
 * Duplicates and unknown ids are dropped rather than refused: this runs on a
 * payout path holding somebody's chips, and an id a client made up should buy
 * nothing rather than throw.
 */
export function numbersFor(bought: readonly string[]): Numbers {
  const numbers = { ...BASE };
  for (const id of new Set(bought)) {
    const up = BY_ID.get(id);
    if (up === undefined) {
      continue;
    }
    numbers.brim += up.brim;
    numbers.trickle += up.trickle;
    numbers.scoop += up.scoop;
  }
  return numbers;
}

/**
 * The fastest this game could conceivably pay, derived from the ladder rather
 * than written down. The guard is built on it, so a retune that raises the top
 * of the ladder raises the ceiling with it instead of quietly breaching one.
 */
export const MAX: Numbers = numbersFor(UPGRADES.map((up) => up.id));

/** Favours earned by a payout taking the night's total from one figure to another. */
export function favoursFor(paidBefore: number, paidAfter: number): number {
  return Math.floor(paidAfter / FAVOUR_PER_CHIPS) - Math.floor(paidBefore / FAVOUR_PER_CHIPS);
}
