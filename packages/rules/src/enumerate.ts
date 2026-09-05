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
      // Snapshot once: bestPartition only reads it, and the pushed option
      // can share the same array rather than allocating a second copy.
      const snapshot = [...current] as Counts;
      const partition = bestPartition(snapshot, rules, memo);
      if (partition === null) {
        return;
      }
      options.push({
        counts: snapshot,
        points: partition.points,
        diceUsed: totalDice(current),
        breakdown: partition.breakdown,
      });
      return;
    }
    // Every iteration below reassigns current[face] before it is read again,
    // so there is no need to reset it once the loop finishes.
    for (let n = 0; n <= available[face]; n += 1) {
      current[face] = n;
      walk(face + 1);
    }
  };

  walk(0);

  options.sort((a, b) => b.points - a.points || a.diceUsed - b.diceUsed);
  return options;
}
