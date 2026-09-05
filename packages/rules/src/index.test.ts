import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  MINIMAL_RULESET,
  bustProbabilities,
  enumerateOptions,
  hasAnyScore,
  scoreSelection,
} from "./index.js";
import type { Die, Ruleset } from "./index.js";

/** Every roll of n dice, as an array of arrays. */
function allRolls(n: number): Die[][] {
  const rolls: Die[][] = [];
  const total = 6 ** n;
  for (let roll = 0; roll < total; roll += 1) {
    const dice: Die[] = [];
    let remainder = roll;
    for (let position = 0; position < n; position += 1) {
      dice.push(((remainder % 6) + 1) as Die);
      remainder = Math.floor(remainder / 6);
    }
    rolls.push(dice);
  }
  return rolls;
}

describe("public surface", () => {
  it("exports the functions the rest of the app depends on", () => {
    expect(typeof scoreSelection).toBe("function");
    expect(typeof enumerateOptions).toBe("function");
    expect(typeof hasAnyScore).toBe("function");
    expect(typeof bustProbabilities).toBe("function");
  });
});

describe("cross-module invariants over all 46656 six-dice rolls", () => {
  const rolls = allRolls(6);

  it("agrees between hasAnyScore and enumerateOptions", () => {
    for (const dice of rolls) {
      expect(enumerateOptions(dice, DEFAULT_RULESET).length > 0).toBe(
        hasAnyScore(dice, DEFAULT_RULESET),
      );
    }
  });

  it("busts on exactly 1080 rolls under the default ruleset", () => {
    const busts = rolls.filter((dice) => !hasAnyScore(dice, DEFAULT_RULESET));
    expect(busts).toHaveLength(1080);
  });

  it("busts on exactly 1440 rolls under the minimal ruleset", () => {
    const busts = rolls.filter((dice) => !hasAnyScore(dice, MINIMAL_RULESET));
    expect(busts).toHaveLength(1440);
  });

  it("never reports an option that scoreSelection disagrees with", () => {
    for (const dice of rolls) {
      const best = enumerateOptions(dice, DEFAULT_RULESET)[0];
      if (best === undefined) {
        continue;
      }
      const kept: Die[] = [];
      for (let index = 0; index < 6; index += 1) {
        for (let n = 0; n < (best.counts[index] as number); n += 1) {
          kept.push((index + 1) as Die);
        }
      }
      const scored = scoreSelection(kept, DEFAULT_RULESET);
      expect(scored.valid).toBe(true);
      expect(scored.points).toBe(best.points);
    }
  });

  it("never scores a selection above the best enumerated option", () => {
    for (const dice of rolls) {
      const options = enumerateOptions(dice, DEFAULT_RULESET);
      const best = options[0];
      if (best === undefined) {
        continue;
      }
      for (const option of options) {
        expect(option.points).toBeLessThanOrEqual(best.points);
      }
    }
  });
});

describe("enabling a rule never makes a roll bust more often", () => {
  const nullableRules = ["straight", "threePairs", "twoTriplets", "fourPlusPair"] as const;

  it.each(nullableRules)("holds across all six-dice rolls when enabling %s", (rule) => {
    const generous: Ruleset = { ...DEFAULT_RULESET, [rule]: 1500 };
    for (const dice of allRolls(6)) {
      if (hasAnyScore(dice, DEFAULT_RULESET)) {
        expect(hasAnyScore(dice, generous)).toBe(true);
      }
    }
  });
});
