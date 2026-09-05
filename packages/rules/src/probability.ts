import { applicableCombos, comboGateKey } from "./combos.js";
import { toCounts } from "./counts.js";
import type { Die, Ruleset } from "./types.js";

/** Bust chance by dice remaining. Index 0 is one die, index 5 is six. */
export type BustTable = readonly [number, number, number, number, number, number];

/**
 * True when at least one die in the roll can be set aside for points.
 *
 * A roll scores exactly when some combination fits inside it, which is what
 * applicableCombos already answers.
 */
export function hasAnyScore(dice: readonly Die[], rules: Ruleset): boolean {
  if (dice.length === 0) {
    return false;
  }
  return applicableCombos(toCounts(dice), rules).length > 0;
}

/** Exhaustively count the rolls of `diceCount` dice that score nothing. */
export function countBustingRolls(diceCount: number, rules: Ruleset): number {
  const dice: Die[] = new Array<Die>(diceCount).fill(1);
  const total = 6 ** diceCount;
  let busts = 0;
  for (let roll = 0; roll < total; roll += 1) {
    let remainder = roll;
    for (let position = 0; position < diceCount; position += 1) {
      dice[position] = ((remainder % 6) + 1) as Die;
      remainder = Math.floor(remainder / 6);
    }
    if (!hasAnyScore(dice, rules)) {
      busts += 1;
    }
  }
  return busts;
}

const tableCache = new Map<string, BustTable>();

/**
 * Bust probability for one through six dice under these rules.
 *
 * Computed rather than hardcoded, because the odds genuinely depend on the
 * ruleset: enabling three pairs makes six dice meaningfully safer. The full
 * enumeration is 46,656 rolls in the worst case and is cached, keyed on
 * which combo types can fire (see `comboGateKey`) rather than on raw field
 * values, so the number of distinct tables is bounded by the number of gate
 * combinations rather than growing with every point-value tweak a host
 * makes. The cached table is frozen, since it is module-global state shared
 * by every caller.
 */
export function bustProbabilities(rules: Ruleset): BustTable {
  const key = comboGateKey(rules);
  const cached = tableCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const table: BustTable = Object.freeze([
    countBustingRolls(1, rules) / 6,
    countBustingRolls(2, rules) / 6 ** 2,
    countBustingRolls(3, rules) / 6 ** 3,
    countBustingRolls(4, rules) / 6 ** 4,
    countBustingRolls(5, rules) / 6 ** 5,
    countBustingRolls(6, rules) / 6 ** 6,
  ]);
  tableCache.set(key, table);
  return table;
}

export function bustProbability(diceRemaining: number, rules: Ruleset): number {
  if (!Number.isInteger(diceRemaining) || diceRemaining < 1 || diceRemaining > 6) {
    throw new RangeError(`diceRemaining must be 1 to 6, got ${diceRemaining}`);
  }
  return bustProbabilities(rules)[diceRemaining - 1] as number;
}
