import type { FaceScores, Ruleset } from "./types.js";

/**
 * Build the pip edition's row for one face: a single value, nothing for a pair,
 * a triple, then doubling for four, five and six of a kind.
 */
function pipFace(single: number, triple: number): FaceScores {
  return [single, 0, triple, triple * 2, triple * 4, triple * 8];
}

/**
 * The classic pip game. Ones and fives score alone; a triple of face N is worth
 * N x 100, except three 1s at 1,000.
 */
export const DEFAULT_RULESET: Ruleset = Object.freeze({
  name: "Classic",
  skin: "pips",

  targetScore: 10_000,
  entryThreshold: 500,
  finalRound: true,
  turnTimerSeconds: 60,

  faces: Object.freeze([
    pipFace(100, 1000), // 1
    pipFace(0, 200), // 2
    pipFace(0, 300), // 3
    pipFace(0, 400), // 4
    pipFace(50, 500), // 5
    pipFace(0, 600), // 6
  ] as const),

  straight: 1500,
  threePairs: 750,
  twoTriplets: 2500,
  fourPlusPair: null,

  farklePenalty: null,
});

/**
 * Ones, fives and n-of-a-kind only — no straight, no pairs. The smallest
 * ruleset the game supports, and the baseline the probability invariants are
 * measured against.
 */
export const MINIMAL_RULESET: Ruleset = Object.freeze({
  ...DEFAULT_RULESET,
  name: "Bare",
  straight: null,
  threePairs: null,
  twoTriplets: null,
  fourPlusPair: null,
});

/**
 * The retail edition sold with letters on the faces: `$ G R E E D`, where the
 * two E dice are different colours. Faces map in that order, so face 4 is the
 * black E and face 5 the green one.
 *
 * The colour rules need no special handling. `$GREED` is the straight — one of
 * every face, which is exactly "one E of each colour" — and an of-a-kind
 * already requires the same face, which is exactly "the E's must match".
 *
 * Scoring is from the game's own card. Three unknowns are set to 0, meaning
 * "not a combination", and are marked below; see
 * docs/reference/letter-dice-edition.md.
 */
export const LETTER_RULESET: Ruleset = Object.freeze({
  name: "Letter dice",
  skin: "letters",

  targetScore: 5_000,
  entryThreshold: 500,
  finalRound: true,
  turnTimerSeconds: 60,

  faces: Object.freeze([
    //     1   2  3     4      5   6      single, pair, triple, four, five, six
    Object.freeze([0, 0, 600, 0, 0, 5000] as const), // $  — four and five unknown
    Object.freeze([50, 0, 500, 0, 0, 5000] as const), // G — four and five unknown
    Object.freeze([0, 0, 400, 0, 0, 5000] as const), // R  — four and five unknown
    Object.freeze([0, 0, 300, 0, 0, 5000] as const), // E black
    Object.freeze([0, 0, 300, 0, 0, 5000] as const), // E green
    // D scores 100 alone and 1,000 for four. Three D is not on the card, so it
    // is left to score as three singles; five is unknown.
    Object.freeze([100, 0, 0, 1000, 0, 5000] as const),
  ] as const),

  straight: 1000, // $GREED
  threePairs: null,
  twoTriplets: null,
  fourPlusPair: null,

  farklePenalty: null,
});

/** Every ruleset a lobby can pick, in the order they should be offered. */
export const RULESETS: readonly Ruleset[] = Object.freeze([DEFAULT_RULESET, LETTER_RULESET]);
