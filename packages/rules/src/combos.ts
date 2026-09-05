import { combinations, contains, emptyCounts, facesWithAtLeast } from "./counts.js";
import type { Combo, ComboKind, Counts, Die, Ruleset } from "./types.js";

const STRAIGHT: Counts = [1, 1, 1, 1, 1, 1];

function singleCombo(face: 1 | 5, points: number): Combo {
  const counts = emptyCounts();
  counts[face - 1] = 1;
  return {
    kind: face === 1 ? "single-one" : "single-five",
    face,
    points,
    counts,
  };
}

function nOfAKindPoints(face: Die, n: number, rules: Ruleset): number {
  const triple = face === 1 ? rules.tripleOne : face * rules.tripleMultiplier;
  if (n === 3) {
    return triple;
  }
  if (rules.nOfAKind === "flat") {
    if (n === 4) return rules.flatFour;
    if (n === 5) return rules.flatFive;
    return rules.flatSix;
  }
  if (n === 4) return triple * 2;
  if (n === 5) return triple * 4;
  return triple * 8;
}

function nOfAKindKind(n: number): ComboKind {
  if (n === 3) return "triple";
  if (n === 4) return "four-kind";
  if (n === 5) return "five-kind";
  return "six-kind";
}

function nOfAKindCombo(face: Die, n: number, rules: Ruleset): Combo {
  const counts = emptyCounts();
  counts[face - 1] = n;
  return {
    kind: nOfAKindKind(n),
    face,
    points: nOfAKindPoints(face, n, rules),
    counts,
  };
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

  if (rules.singleOne > 0 && counts[0] >= 1) {
    combos.push(singleCombo(1, rules.singleOne));
  }
  if (rules.singleFive > 0 && counts[4] >= 1) {
    combos.push(singleCombo(5, rules.singleFive));
  }

  for (let index = 0; index < 6; index += 1) {
    const face = (index + 1) as Die;
    for (let n = 3; n <= counts[index]; n += 1) {
      const combo = nOfAKindCombo(face, n, rules);
      if (combo.points > 0) {
        combos.push(combo);
      }
    }
  }

  const { straight, threePairs, twoTriplets, fourPlusPair } = rules;

  if (straight !== null && straight > 0 && contains(counts, STRAIGHT)) {
    combos.push({ kind: "straight", face: null, points: straight, counts: [...STRAIGHT] });
  }

  if (threePairs !== null && threePairs > 0) {
    // Exactly three distinct faces showing exactly two each. A face showing
    // four or more is not two pairs; that is what fourPlusPair is for. At six
    // dice this filter is defensive and unreachable: three faces at >=4 would
    // need at least 4+2+2 = 8 dice, so it never actually excludes anything.
    const paired = facesWithAtLeast(counts, 2).filter((face) => counts[face - 1] < 4);
    for (const trio of combinations(paired, 3)) {
      const comboCounts = emptyCounts();
      for (const face of trio) {
        comboCounts[face - 1] = 2;
      }
      combos.push({ kind: "three-pairs", face: null, points: threePairs, counts: comboCounts });
    }
  }

  if (twoTriplets !== null && twoTriplets > 0) {
    const tripled = facesWithAtLeast(counts, 3);
    for (const pair of combinations(tripled, 2)) {
      const comboCounts = emptyCounts();
      for (const face of pair) {
        comboCounts[face - 1] = 3;
      }
      combos.push({ kind: "two-triplets", face: null, points: twoTriplets, counts: comboCounts });
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
        combos.push({
          kind: "four-plus-pair",
          face: null,
          points: fourPlusPair,
          counts: comboCounts,
        });
      }
    }
  }

  return combos;
}

/**
 * The cache key `bustProbabilities` uses to memoize its bust table.
 *
 * Whether a roll busts depends only on which combo types can ever fire, not
 * on their point values — so this mirrors exactly the gates above (each
 * `> 0` / `!== null` check that guards a push) rather than joining the raw
 * ruleset fields. Two rulesets whose gates agree produce bit-identical bust
 * tables, so they must collide on this key; if a gate above changes, update
 * this function alongside it or the two will silently drift apart.
 */
export function comboGateKey(rules: Ruleset): string {
  const flat = rules.nOfAKind === "flat";
  return [
    rules.singleOne > 0,
    rules.singleFive > 0,
    rules.tripleOne > 0,
    rules.tripleMultiplier > 0,
    rules.nOfAKind,
    // In "double" mode these follow from the triple gates above, so they
    // carry no extra information and are held constant to avoid splitting
    // otherwise-identical tables.
    flat && rules.flatFour > 0,
    flat && rules.flatFive > 0,
    flat && rules.flatSix > 0,
    rules.straight !== null && rules.straight > 0,
    rules.threePairs !== null && rules.threePairs > 0,
    rules.twoTriplets !== null && rules.twoTriplets > 0,
    rules.fourPlusPair !== null && rules.fourPlusPair > 0,
  ].join("|");
}
