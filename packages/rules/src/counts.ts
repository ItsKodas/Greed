import type { Counts, Die } from "./types.js";

export function emptyCounts(): Counts {
  return [0, 0, 0, 0, 0, 0];
}

export function toCounts(dice: readonly Die[]): Counts {
  const counts = emptyCounts();
  for (const die of dice) {
    counts[die - 1] += 1;
  }
  return counts;
}

export function fromCounts(counts: Counts): Die[] {
  const dice: Die[] = [];
  for (let index = 0; index < 6; index += 1) {
    for (let n = 0; n < counts[index]; n += 1) {
      dice.push((index + 1) as Die);
    }
  }
  return dice;
}

export function totalDice(counts: Counts): number {
  return counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
}

/** True when `haystack` has at least as many of every face as `needle`. */
export function contains(haystack: Counts, needle: Counts): boolean {
  for (let index = 0; index < 6; index += 1) {
    if (needle[index] > haystack[index]) {
      return false;
    }
  }
  return true;
}

export function subtract(from: Counts, taken: Counts): Counts {
  return [
    from[0] - taken[0],
    from[1] - taken[1],
    from[2] - taken[2],
    from[3] - taken[3],
    from[4] - taken[4],
    from[5] - taken[5],
  ];
}

/** Memoization key. Count vectors are fixed-length, so join is unambiguous. */
export function countsKey(counts: Counts): string {
  return counts.join(",");
}

export function facesWithAtLeast(counts: Counts, n: number): Die[] {
  const faces: Die[] = [];
  for (let index = 0; index < 6; index += 1) {
    if (counts[index] >= n) {
      faces.push((index + 1) as Die);
    }
  }
  return faces;
}

/** Every k-subset of `items`, preserving input order within each subset. */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) {
    return [[]];
  }
  if (k > items.length) {
    return [];
  }
  const result: T[][] = [];
  const build = (start: number, chosen: T[]): void => {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index] as T);
      build(index + 1, chosen);
      chosen.pop();
    }
  };
  build(0, []);
  return result;
}
