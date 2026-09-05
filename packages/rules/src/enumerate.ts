import { emptyCounts, toCounts, totalDice } from "./counts.js";
import { bestPartition, type Partition } from "./score.js";
import type { Counts, Die, Option, Ruleset } from "./types.js";

/**
 * Every fully-scoring selection a player could make from this roll.
 *
 * Walks all sub-multisets of the roll and keeps the ones that partition
 * cleanly. One memo is shared across the whole walk, so overlapping
 * sub-selections are scored once.
 */
export function enumerateOptions(dice: readonly Die[], rules: Ruleset): Option[] {
  if (dice.length === 0) {
    return [];
  }

  const available = toCounts(dice);
  const memo = new Map<string, Partition | null>();
  const options: Option[] = [];
  const current = emptyCounts();

  const walk = (face: number): void => {
    if (face === 6) {
      if (totalDice(current) === 0) {
        return;
      }
      const partition = bestPartition([...current] as Counts, rules, memo);
      if (partition === null) {
        return;
      }
      options.push({
        counts: [...current] as Counts,
        points: partition.points,
        diceUsed: totalDice(current),
        breakdown: partition.breakdown,
      });
      return;
    }
    for (let n = 0; n <= available[face]; n += 1) {
      current[face] = n;
      walk(face + 1);
    }
    current[face] = 0;
  };

  walk(0);

  options.sort((a, b) => b.points - a.points || a.diceUsed - b.diceUsed);
  return options;
}
