import { applicableCombos } from "./combos.js";
import { countsKey, subtract, toCounts, totalDice } from "./counts.js";
import type { Combo, Counts, Die, Ruleset, ScoreResult } from "./types.js";

export interface Partition {
  readonly points: number;
  readonly breakdown: readonly Combo[];
}

/**
 * The highest-scoring way to cover `counts` entirely with combinations,
 * or null when no such covering exists (some die cannot score).
 *
 * Every combination consumes at least one die, so the recursion strictly
 * decreases and cannot cycle. The memo is keyed on the count vector, which
 * is why callers may share one across an enumeration.
 */
export function bestPartition(
  counts: Counts,
  rules: Ruleset,
  memo: Map<string, Partition | null>,
): Partition | null {
  if (totalDice(counts) === 0) {
    return { points: 0, breakdown: [] };
  }

  const key = countsKey(counts);
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: Partition | null = null;
  for (const combo of applicableCombos(counts, rules)) {
    const rest = bestPartition(subtract(counts, combo.counts), rules, memo);
    if (rest === null) {
      continue;
    }
    const points = combo.points + rest.points;
    if (best === null || points > best.points) {
      best = { points, breakdown: [combo, ...rest.breakdown] };
    }
  }

  memo.set(key, best);
  return best;
}

/**
 * Score a set of dice a player wants to set aside.
 *
 * The selection must be fully scoring: every die has to belong to some
 * combination. This is what stops a player keeping a dead die to hold more
 * dice back from the next roll.
 */
export function scoreSelection(dice: readonly Die[], rules: Ruleset): ScoreResult {
  if (dice.length === 0) {
    return { valid: false, points: 0, breakdown: [] };
  }
  const partition = bestPartition(toCounts(dice), rules, new Map());
  if (partition === null) {
    return { valid: false, points: 0, breakdown: [] };
  }
  return { valid: true, points: partition.points, breakdown: partition.breakdown };
}
