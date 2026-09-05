import { describe, expect, it } from "vitest";
import { applicableCombos } from "./combos.js";
import { toCounts } from "./counts.js";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import type { ComboKind, Die, Ruleset } from "./types.js";

function kindsFor(dice: Die[], rules: Ruleset = DEFAULT_RULESET): ComboKind[] {
  return applicableCombos(toCounts(dice), rules).map((combo) => combo.kind);
}

function pointsFor(dice: Die[], kind: ComboKind, rules: Ruleset = DEFAULT_RULESET): number {
  const combo = applicableCombos(toCounts(dice), rules).find((c) => c.kind === kind);
  if (combo === undefined) {
    throw new Error(`no ${kind} combo found`);
  }
  return combo.points;
}

describe("singles", () => {
  it("offers a single one", () => {
    expect(kindsFor([1])).toEqual(["single-one"]);
    expect(pointsFor([1], "single-one")).toBe(100);
  });

  it("offers a single five", () => {
    expect(kindsFor([5])).toEqual(["single-five"]);
    expect(pointsFor([5], "single-five")).toBe(50);
  });

  it("offers nothing for a lone non-scoring die", () => {
    expect(kindsFor([3])).toEqual([]);
  });
});

describe("n-of-a-kind", () => {
  it("scores three ones at tripleOne", () => {
    expect(pointsFor([1, 1, 1], "triple")).toBe(1000);
  });

  it("scores three of a non-one at face times the multiplier", () => {
    expect(pointsFor([4, 4, 4], "triple")).toBe(400);
  });

  it("doubles for four, quadruples for five, octuples for six", () => {
    expect(pointsFor([2, 2, 2, 2], "four-kind")).toBe(400);
    expect(pointsFor([2, 2, 2, 2, 2], "five-kind")).toBe(800);
    expect(pointsFor([2, 2, 2, 2, 2, 2], "six-kind")).toBe(1600);
  });

  it("uses flat values when the ruleset says so", () => {
    const flat: Ruleset = { ...DEFAULT_RULESET, nOfAKind: "flat" };
    expect(pointsFor([2, 2, 2, 2], "four-kind", flat)).toBe(1000);
    expect(pointsFor([2, 2, 2, 2, 2], "five-kind", flat)).toBe(2000);
    expect(pointsFor([2, 2, 2, 2, 2, 2], "six-kind", flat)).toBe(3000);
  });

  it("offers every n-of-a-kind up to the count available", () => {
    const kinds = kindsFor([3, 3, 3, 3]);
    expect(kinds).toContain("triple");
    expect(kinds).toContain("four-kind");
  });
});

describe("multi-face combinations", () => {
  it("offers a straight only for one of each face", () => {
    expect(kindsFor([1, 2, 3, 4, 5, 6])).toContain("straight");
    expect(kindsFor([1, 2, 3, 4, 5, 5])).not.toContain("straight");
  });

  it("offers three pairs for three distinct doubled faces", () => {
    expect(kindsFor([2, 2, 3, 3, 4, 4])).toContain("three-pairs");
  });

  it("does not call four of a kind plus a pair three pairs", () => {
    expect(kindsFor([2, 2, 2, 2, 3, 3])).not.toContain("three-pairs");
  });

  it("does not call six of a kind three pairs", () => {
    expect(kindsFor([2, 2, 2, 2, 2, 2])).not.toContain("three-pairs");
  });

  it("offers two triplets for two distinct tripled faces", () => {
    expect(kindsFor([2, 2, 2, 3, 3, 3])).toContain("two-triplets");
  });

  it("does not call six of a kind two triplets", () => {
    expect(kindsFor([2, 2, 2, 2, 2, 2])).not.toContain("two-triplets");
  });

  it("offers four plus a pair only when the rule is enabled", () => {
    expect(kindsFor([2, 2, 2, 2, 3, 3])).not.toContain("four-plus-pair");
    const withRule: Ruleset = { ...DEFAULT_RULESET, fourPlusPair: 1500 };
    expect(kindsFor([2, 2, 2, 2, 3, 3], withRule)).toContain("four-plus-pair");
  });
});

describe("ruleset gating", () => {
  it("omits disabled multi-face combinations", () => {
    const kinds = kindsFor([1, 2, 3, 4, 5, 6], MINIMAL_RULESET);
    expect(kinds).not.toContain("straight");
    expect(kinds).not.toContain("three-pairs");
  });

  it("omits a triple worth zero points", () => {
    const zeroed: Ruleset = { ...DEFAULT_RULESET, tripleOne: 0 };
    expect(kindsFor([1, 1, 1], zeroed)).not.toContain("triple");
  });

  it("omits a straight worth zero points", () => {
    const zeroed: Ruleset = { ...DEFAULT_RULESET, straight: 0 };
    expect(kindsFor([1, 2, 3, 4, 5, 6], zeroed)).not.toContain("straight");
  });

  it("omits three pairs worth zero points", () => {
    const zeroed: Ruleset = { ...DEFAULT_RULESET, threePairs: 0 };
    expect(kindsFor([2, 2, 3, 3, 4, 4], zeroed)).not.toContain("three-pairs");
  });
});

describe("combo shape", () => {
  it("declares exactly the dice it consumes", () => {
    const combos = applicableCombos(toCounts([1, 1, 1]), DEFAULT_RULESET);
    const triple = combos.find((combo) => combo.kind === "triple");
    expect(triple?.counts).toEqual([3, 0, 0, 0, 0, 0]);
  });

  it("names the face for single-face combos and leaves it null otherwise", () => {
    const combos = applicableCombos(toCounts([2, 2, 3, 3, 4, 4]), DEFAULT_RULESET);
    expect(combos.find((combo) => combo.kind === "three-pairs")?.face).toBeNull();
    const triples = applicableCombos(toCounts([4, 4, 4]), DEFAULT_RULESET);
    expect(triples.find((combo) => combo.kind === "triple")?.face).toBe(4);
  });
});
