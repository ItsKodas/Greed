/** A single die face. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Dice tallied by face. Index 0 is face 1, index 5 is face 6.
 * Every scoring operation in this package works on this shape.
 */
export type Counts = [number, number, number, number, number, number];

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
  kind: ComboKind;
  /** The face this combo is built from, or null when it spans faces. */
  face: Die | null;
  points: number;
  counts: Counts;
}

export interface ScoreResult {
  /** False when some selected die cannot belong to any combination. */
  valid: boolean;
  points: number;
  /** The highest-scoring partition, for explaining the score in the UI. */
  breakdown: Combo[];
}

/** One legal way to set dice aside from a roll. */
export interface Option {
  counts: Counts;
  points: number;
  diceUsed: number;
  breakdown: Combo[];
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
