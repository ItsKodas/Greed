/** A single die face, by index. What it *looks* like is the skin's business. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Dice tallied by face. Index 0 is face 1, index 5 is face 6.
 * Every scoring operation in this package works on this shape.
 */
export type Counts = [number, number, number, number, number, number];

/** Read-only view of a count vector, for values handed back to callers. */
export type ReadonlyCounts = readonly [number, number, number, number, number, number];

/**
 * What N of one face is worth. Index 0 is a single die, index 5 is all six.
 * Zero means "no combination" — those dice cannot be set aside as a group,
 * though they may still score individually if index 0 is non-zero.
 */
export type FaceScores = readonly [number, number, number, number, number, number];

export type ComboKind =
  | "of-a-kind"
  | "straight"
  | "three-pairs"
  | "two-triplets"
  | "four-plus-pair";

/** One scoring combination, and exactly which dice it consumes. */
export interface Combo {
  readonly kind: ComboKind;
  /** The face this combo is built from, or null when it spans faces. */
  readonly face: Die | null;
  /** How many dice it consumes. */
  readonly size: number;
  readonly points: number;
  readonly counts: ReadonlyCounts;
}

export interface ScoreResult {
  /** False when some selected die cannot belong to any combination. */
  readonly valid: boolean;
  readonly points: number;
  /** The highest-scoring partition, for explaining the score in the UI. */
  readonly breakdown: readonly Combo[];
}

/** One legal way to set dice aside from a roll. */
export interface Option {
  readonly counts: ReadonlyCounts;
  readonly points: number;
  readonly diceUsed: number;
  readonly breakdown: readonly Combo[];
}

export interface FarklePenalty {
  readonly consecutive: number;
  readonly points: number;
}

/** How the faces are drawn. Presentation only; scoring never reads this. */
export type DiceSkin = "pips" | "letters";

export interface Ruleset {
  /** Shown in the lobby, e.g. "Classic" or "Letter dice". */
  readonly name: string;
  readonly skin: DiceSkin;

  readonly targetScore: number;
  readonly entryThreshold: number;
  readonly finalRound: boolean;
  readonly turnTimerSeconds: number | null;

  /**
   * Per face, indexed 0..5 for faces 1..6: what N of that face scores.
   *
   * This replaces the old singleOne/singleFive/tripleMultiplier scheme, which
   * could not express the letter edition — its two E faces must both score 300
   * as triples while being genuinely different faces, and no `face x multiplier`
   * formula allows that.
   */
  readonly faces: readonly [
    FaceScores,
    FaceScores,
    FaceScores,
    FaceScores,
    FaceScores,
    FaceScores,
  ];

  /** One of every face. In the letter edition this is `$GREED`. */
  readonly straight: number | null;
  readonly threePairs: number | null;
  readonly twoTriplets: number | null;
  readonly fourPlusPair: number | null;

  readonly farklePenalty: FarklePenalty | null;
}
