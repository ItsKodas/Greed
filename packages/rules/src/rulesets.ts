import type { Ruleset } from "./types.js";

/** The classic house rules. Frozen: lobbies spread it, they never mutate it. */
export const DEFAULT_RULESET: Readonly<Ruleset> = Object.freeze({
  targetScore: 10_000,
  entryThreshold: 500,
  finalRound: true,
  turnTimerSeconds: 60,

  singleOne: 100,
  singleFive: 50,
  tripleOne: 1000,
  tripleMultiplier: 100,

  nOfAKind: "double",
  flatFour: 1000,
  flatFive: 2000,
  flatSix: 3000,

  straight: 1500,
  threePairs: 750,
  twoTriplets: 2500,
  fourPlusPair: null,

  farklePenalty: null,
});

/**
 * Ones, fives and n-of-a-kind only. The smallest ruleset the game supports,
 * and the baseline the probability invariants are measured against.
 */
export const MINIMAL_RULESET: Readonly<Ruleset> = Object.freeze({
  ...DEFAULT_RULESET,
  straight: null,
  threePairs: null,
  twoTriplets: null,
  fourPlusPair: null,
});
