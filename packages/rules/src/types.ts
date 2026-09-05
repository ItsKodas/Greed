/** A single die face. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Dice tallied by face. Index 0 is face 1, index 5 is face 6.
 * Every scoring operation in this package works on this shape.
 */
export type Counts = [number, number, number, number, number, number];

/**
 * A count vector as handed back to a caller. Internal working vectors stay
 * mutable `Counts`; anything returned from the public surface uses this so
 * a caller cannot corrupt state another result still references.
 */
export type ReadonlyCounts = readonly [number, number, number, number, number, number];

export type ComboKind =
  | "single-one"
  | "single-five"
  | "triple"
  | "four-kind"
  | "five-kind"
  | "six-kind"
  | "straight"
  | "three-pairs"
  | "two-triplets"
  | "four-plus-pair";

/** One scoring combination, and exactly which dice it consumes. */
export interface Combo {
  readonly kind: ComboKind;
  /** The face this combo is built from, or null when it spans faces. */
  readonly face: Die | null;
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

export type NOfAKindMode = "double" | "flat";

export interface FarklePenalty {
  consecutive: number;
  points: number;
}

export interface Ruleset {
  targetScore: number;
  entryThreshold: number;
  finalRound: boolean;
  turnTimerSeconds: number | null;

  singleOne: number;
  singleFive: number;
  tripleOne: number;
  /** Three of a kind of face N scores N * this, except face 1 (see tripleOne). */
  tripleMultiplier: number;

  nOfAKind: NOfAKindMode;
  flatFour: number;
  flatFive: number;
  flatSix: number;

  straight: number | null;
  threePairs: number | null;
  twoTriplets: number | null;
  fourPlusPair: number | null;

  farklePenalty: FarklePenalty | null;
}
