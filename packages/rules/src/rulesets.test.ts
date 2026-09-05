import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";

describe("DEFAULT_RULESET", () => {
  it("matches the classic house rules", () => {
    expect(DEFAULT_RULESET.targetScore).toBe(10_000);
    expect(DEFAULT_RULESET.entryThreshold).toBe(500);
    expect(DEFAULT_RULESET.singleOne).toBe(100);
    expect(DEFAULT_RULESET.singleFive).toBe(50);
    expect(DEFAULT_RULESET.tripleOne).toBe(1000);
    expect(DEFAULT_RULESET.tripleMultiplier).toBe(100);
    expect(DEFAULT_RULESET.nOfAKind).toBe("double");
  });

  it("enables straights, three pairs and two triplets", () => {
    expect(DEFAULT_RULESET.straight).toBe(1500);
    expect(DEFAULT_RULESET.threePairs).toBe(750);
    expect(DEFAULT_RULESET.twoTriplets).toBe(2500);
  });

  it("leaves the punishing options off", () => {
    expect(DEFAULT_RULESET.fourPlusPair).toBeNull();
    expect(DEFAULT_RULESET.farklePenalty).toBeNull();
  });

  it("is frozen so a lobby cannot mutate the shared default", () => {
    expect(Object.isFrozen(DEFAULT_RULESET)).toBe(true);
  });
});

describe("MINIMAL_RULESET", () => {
  it("scores only ones, fives and n-of-a-kind", () => {
    expect(MINIMAL_RULESET.straight).toBeNull();
    expect(MINIMAL_RULESET.threePairs).toBeNull();
    expect(MINIMAL_RULESET.twoTriplets).toBeNull();
    expect(MINIMAL_RULESET.fourPlusPair).toBeNull();
  });

  it("keeps the same core values as the default", () => {
    expect(MINIMAL_RULESET.singleOne).toBe(DEFAULT_RULESET.singleOne);
    expect(MINIMAL_RULESET.tripleOne).toBe(DEFAULT_RULESET.tripleOne);
  });
});
