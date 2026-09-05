import { combinations, contains, emptyCounts, facesWithAtLeast } from "./counts.js";
import type { Combo, Counts, Die, ReadonlyCounts, Ruleset } from "./types.js";

const STRAIGHT: ReadonlyCounts = Object.freeze([1, 1, 1, 1, 1, 1] as const);

function ofAKind(face: Die, size: number, points: number): Combo {
  const counts = emptyCounts();
  counts[face - 1] = size;
  return Object.freeze({ kind: "of-a-kind", face, size, points, counts });
}

function spanning(
  kind: "straight" | "three-pairs" | "two-triplets" | "four-plus-pair",
  counts: Counts,
  points: number,
): Combo {
  const size = counts.reduce((total, n) => total + n, 0);
  return Object.freeze({ kind, face: null, size, points, counts });
}

/**
 * Every combination that fits inside `counts` under `rules`.
 *
 * This deliberately over-produces: for four 2s it offers both the triple and
 * the four-of-a-kind. Choosing between them is the partition search's job,
 * because the best choice depends on what the remaining dice can do.
 */
export function applicableCombos(counts: Counts, rules: Ruleset): Combo[] {
  const combos: Combo[] = [];

  // Of-a-kind, straight from the per-face table. A zero means that many of
  // that face is not a combination — three D in the letter edition, say, which
  // instead scores as three separate singles.
  for (let index = 0; index < 6; index += 1) {
    const face = (index + 1) as Die;
    const scores = rules.faces[index];
    const available = counts[index];
    for (let size = 1; size <= available; size += 1) {
      const points = scores[size - 1] ?? 0;
      if (points > 0) {
        combos.push(ofAKind(face, size, points));
      }
    }
  }

  const { straight, threePairs, twoTriplets, fourPlusPair } = rules;

  if (straight !== null && straight > 0 && contains(counts, STRAIGHT)) {
    combos.push(spanning("straight", [1, 1, 1, 1, 1, 1], straight));
  }

  if (threePairs !== null && threePairs > 0) {
    // Exactly three distinct faces showing exactly two each. A face showing
    // four or more is not two pairs; that is what fourPlusPair is for.
    const paired = facesWithAtLeast(counts, 2).filter((face) => counts[face - 1] < 4);
    for (const trio of combinations(paired, 3)) {
      const comboCounts = emptyCounts();
      for (const face of trio) {
        comboCounts[face - 1] = 2;
      }
      combos.push(spanning("three-pairs", comboCounts, threePairs));
    }
  }

  if (twoTriplets !== null && twoTriplets > 0) {
    const tripled = facesWithAtLeast(counts, 3);
    for (const pair of combinations(tripled, 2)) {
      const comboCounts = emptyCounts();
      for (const face of pair) {
        comboCounts[face - 1] = 3;
      }
      combos.push(spanning("two-triplets", comboCounts, twoTriplets));
    }
  }

  if (fourPlusPair !== null && fourPlusPair > 0) {
    for (const quad of facesWithAtLeast(counts, 4)) {
      for (const pair of facesWithAtLeast(counts, 2)) {
        if (pair === quad) {
          continue;
        }
        const comboCounts = emptyCounts();
        comboCounts[quad - 1] = 4;
        comboCounts[pair - 1] = 2;
        combos.push(spanning("four-plus-pair", comboCounts, fourPlusPair));
      }
    }
  }

  return combos;
}

/**
 * A key covering exactly what decides whether a roll scores at all.
 *
 * Bust chance depends only on which combinations *can* fire, not on what they
 * pay, so two rulesets differing only in point values share one table. Lives
 * here, beside the gates it mirrors, so the two cannot drift apart.
 */
export function comboGateKey(rules: Ruleset): string {
  const faceGates = rules.faces
    .map((scores) => scores.map((points) => (points > 0 ? "1" : "0")).join(""))
    .join(",");
  return [
    faceGates,
    rules.straight !== null && rules.straight > 0,
    rules.threePairs !== null && rules.threePairs > 0,
    rules.twoTriplets !== null && rules.twoTriplets > 0,
    rules.fourPlusPair !== null && rules.fourPlusPair > 0,
  ].join("|");
}
