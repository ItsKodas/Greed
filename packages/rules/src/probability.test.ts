import { describe, expect, it } from "vitest";
import {
  bustProbabilities,
  bustProbability,
  countBustingRolls,
  hasAnyScore,
} from "./probability.js";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import type { Ruleset } from "./types.js";

describe("hasAnyScore", () => {
  it("is true when a one is present", () => {
    expect(hasAnyScore([1, 2, 3], DEFAULT_RULESET)).toBe(true);
  });

  it("is true when a five is present", () => {
    expect(hasAnyScore([5, 2, 3], DEFAULT_RULESET)).toBe(true);
  });

  it("is true for a triple with no ones or fives", () => {
    expect(hasAnyScore([2, 2, 2], DEFAULT_RULESET)).toBe(true);
  });

  it("is false for a roll with nothing scoring", () => {
    expect(hasAnyScore([2, 3, 4], DEFAULT_RULESET)).toBe(false);
  });

  it("is false for no dice", () => {
    expect(hasAnyScore([], DEFAULT_RULESET)).toBe(false);
  });

  it("respects three pairs when enabled", () => {
    expect(hasAnyScore([2, 2, 3, 3, 4, 4], DEFAULT_RULESET)).toBe(true);
    expect(hasAnyScore([2, 2, 3, 3, 4, 4], MINIMAL_RULESET)).toBe(false);
  });

  it("is false for a triple worth zero points, rather than a zero-point score", () => {
    // Face 2 has no single-die score, so this isolates the n-of-a-kind gate.
    const zeroed: Ruleset = { ...DEFAULT_RULESET, tripleMultiplier: 0 };
    expect(hasAnyScore([2, 2, 2], zeroed)).toBe(false);
  });
});

describe("countBustingRolls", () => {
  // Faces 2, 3, 4 and 6 are the non-scoring singles. Over six dice there are
  // 4^6 = 4096 rolls using only those, of which the (2,2,2,0) shapes number
  // 4 * 90 = 360 and the (2,2,1,1) shapes number 6 * 180 = 1080. Everything
  // else contains a triple. So 1440 bust without three pairs, and 1080 with
  // it, because three pairs rescues exactly the (2,2,2,0) shapes.
  it("counts 1440 busting six-dice rolls under the minimal ruleset", () => {
    expect(countBustingRolls(6, MINIMAL_RULESET)).toBe(1440);
  });

  it("counts 1080 busting six-dice rolls under the default ruleset", () => {
    expect(countBustingRolls(6, DEFAULT_RULESET)).toBe(1080);
  });

  it("counts four busting one-die rolls", () => {
    expect(countBustingRolls(1, DEFAULT_RULESET)).toBe(4);
  });

  it("counts 16 busting two-dice rolls", () => {
    expect(countBustingRolls(2, DEFAULT_RULESET)).toBe(16);
  });

  it("counts 60 busting three-dice rolls", () => {
    expect(countBustingRolls(3, DEFAULT_RULESET)).toBe(60);
  });

  it("counts 204 busting four-dice rolls", () => {
    expect(countBustingRolls(4, DEFAULT_RULESET)).toBe(204);
  });

  it("counts 600 busting five-dice rolls", () => {
    expect(countBustingRolls(5, DEFAULT_RULESET)).toBe(600);
  });

  it("throws for a dice count outside one to six", () => {
    expect(() => countBustingRolls(-1, DEFAULT_RULESET)).toThrow(RangeError);
    expect(() => countBustingRolls(0, DEFAULT_RULESET)).toThrow(RangeError);
    expect(() => countBustingRolls(7, DEFAULT_RULESET)).toThrow(RangeError);
    expect(() => countBustingRolls(1.5, DEFAULT_RULESET)).toThrow(RangeError);
  });
});

describe("bustProbabilities", () => {
  it("reproduces the classic 2.31% on six dice", () => {
    const table = bustProbabilities(DEFAULT_RULESET);
    expect(table[5]).toBeCloseTo(1080 / 46656, 10);
    expect(table[5]).toBeCloseTo(0.023148, 6);
  });

  it("gives two thirds on a single die", () => {
    expect(bustProbabilities(DEFAULT_RULESET)[0]).toBeCloseTo(2 / 3, 10);
  });

  it("rises monotonically as dice run out", () => {
    const table = bustProbabilities(DEFAULT_RULESET);
    for (let index = 0; index < 5; index += 1) {
      expect(table[index]).toBeGreaterThan(table[index + 1]);
    }
  });

  it("returns the same cached table for an equivalent ruleset", () => {
    const first = bustProbabilities(DEFAULT_RULESET);
    const second = bustProbabilities({ ...DEFAULT_RULESET });
    expect(second).toBe(first);
  });

  it("returns a different table when scoring rules differ", () => {
    expect(bustProbabilities(MINIMAL_RULESET)).not.toBe(bustProbabilities(DEFAULT_RULESET));
  });

  it("ignores non-scoring settings when caching", () => {
    const first = bustProbabilities(DEFAULT_RULESET);
    const second = bustProbabilities({ ...DEFAULT_RULESET, targetScore: 5000 });
    expect(second).toBe(first);
  });

  it("ignores a point-value change that does not cross zero when caching", () => {
    // tripleMultiplier 100 vs 101 gates identically (both > 0), so the two
    // rulesets must share one bust table even though the raw field differs.
    const first = bustProbabilities(DEFAULT_RULESET);
    const second = bustProbabilities({ ...DEFAULT_RULESET, tripleMultiplier: 101 });
    expect(second).toBe(first);
  });

  it("is frozen, since it is module-global shared state", () => {
    expect(Object.isFrozen(bustProbabilities(DEFAULT_RULESET))).toBe(true);
  });
});

describe("bustProbability", () => {
  it("indexes the table by dice remaining", () => {
    expect(bustProbability(6, DEFAULT_RULESET)).toBeCloseTo(1080 / 46656, 10);
    expect(bustProbability(1, DEFAULT_RULESET)).toBeCloseTo(2 / 3, 10);
  });

  it("throws for a count outside one to six", () => {
    expect(() => bustProbability(0, DEFAULT_RULESET)).toThrow();
    expect(() => bustProbability(7, DEFAULT_RULESET)).toThrow();
  });
});
