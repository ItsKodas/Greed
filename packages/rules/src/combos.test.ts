import { describe, expect, it } from "vitest";
import { applicableCombos, comboGateKey } from "./combos.js";
import { toCounts } from "./counts.js";
import { DEFAULT_RULESET, LETTER_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import type { Combo, Die, Ruleset } from "./types.js";

function combosFor(dice: Die[], rules: Ruleset = DEFAULT_RULESET): Combo[] {
  return applicableCombos(toCounts(dice), rules);
}

/** Points for the of-a-kind combo of exactly this size, or null if none. */
function ofAKind(dice: Die[], size: number, rules: Ruleset = DEFAULT_RULESET): number | null {
  const found = combosFor(dice, rules).find(
    (combo) => combo.kind === "of-a-kind" && combo.size === size,
  );
  return found === undefined ? null : found.points;
}

function kinds(dice: Die[], rules: Ruleset = DEFAULT_RULESET): string[] {
  return combosFor(dice, rules).map((combo) => combo.kind);
}

describe("singles come from the face table", () => {
  it("offers a single 1 and a single 5 in the pip ruleset", () => {
    expect(ofAKind([1], 1)).toBe(100);
    expect(ofAKind([5], 1)).toBe(50);
  });

  it("offers nothing for a lone non-scoring face", () => {
    expect(combosFor([3])).toEqual([]);
  });

  it("offers nothing for a pair, since no face scores at two", () => {
    expect(ofAKind([1, 1], 2)).toBeNull();
  });
});

describe("of-a-kind reads each face's own row", () => {
  it("scores three 1s at 1000 and three 4s at 400", () => {
    expect(ofAKind([1, 1, 1], 3)).toBe(1000);
    expect(ofAKind([4, 4, 4], 3)).toBe(400);
  });

  it("doubles, quadruples and octuples for four, five and six", () => {
    expect(ofAKind([2, 2, 2, 2], 4)).toBe(400);
    expect(ofAKind([2, 2, 2, 2, 2], 5)).toBe(800);
    expect(ofAKind([2, 2, 2, 2, 2, 2], 6)).toBe(1600);
  });

  it("offers every size up to what is available", () => {
    const sizes = combosFor([3, 3, 3, 3])
      .filter((combo) => combo.kind === "of-a-kind")
      .map((combo) => combo.size);
    expect(sizes).toContain(3);
    expect(sizes).toContain(4);
  });

  it("skips a size whose face row scores zero", () => {
    // Nothing scores at two, so four 3s offer the triple and the quad only.
    const sizes = combosFor([3, 3, 3, 3])
      .filter((combo) => combo.kind === "of-a-kind")
      .map((combo) => combo.size);
    expect(sizes).not.toContain(1);
    expect(sizes).not.toContain(2);
  });
});

describe("the letter edition", () => {
  // Faces map in the order $ G R E(black) E(green) D, so face 4 and face 5 are
  // the two colours of E and face 6 is D.
  const $ = 1 as Die;
  const G = 2 as Die;
  const R = 3 as Die;
  const Eblack = 4 as Die;
  const Egreen = 5 as Die;
  const D = 6 as Die;

  it("scores both E triples at 300 despite them being different faces", () => {
    expect(ofAKind([Eblack, Eblack, Eblack], 3, LETTER_RULESET)).toBe(300);
    expect(ofAKind([Egreen, Egreen, Egreen], 3, LETTER_RULESET)).toBe(300);
  });

  it("cannot mix the colours into one triple", () => {
    expect(ofAKind([Eblack, Eblack, Egreen], 3, LETTER_RULESET)).toBeNull();
  });

  it("runs the ladder 600 / 500 / 400 down the other faces", () => {
    expect(ofAKind([$, $, $], 3, LETTER_RULESET)).toBe(600);
    expect(ofAKind([G, G, G], 3, LETTER_RULESET)).toBe(500);
    expect(ofAKind([R, R, R], 3, LETTER_RULESET)).toBe(400);
  });

  it("scores D alone at 100 and G alone at 50", () => {
    expect(ofAKind([D], 1, LETTER_RULESET)).toBe(100);
    expect(ofAKind([G], 1, LETTER_RULESET)).toBe(50);
  });

  it("gives D its jackpot at four, not three", () => {
    expect(ofAKind([D, D, D], 3, LETTER_RULESET)).toBeNull();
    expect(ofAKind([D, D, D, D], 4, LETTER_RULESET)).toBe(1000);
  });

  it("treats $GREED as the straight, one of every face", () => {
    const straight = combosFor([$, G, R, Eblack, Egreen, D], LETTER_RULESET).find(
      (combo) => combo.kind === "straight",
    );
    expect(straight?.points).toBe(1000);
  });

  it("refuses $GREED when both E dice are the same colour", () => {
    // Two black E and no green: not one of every face, so not a straight.
    expect(kinds([$, G, R, Eblack, Eblack, D], LETTER_RULESET)).not.toContain("straight");
  });

  it("pays 5000 for six of a kind", () => {
    expect(ofAKind([R, R, R, R, R, R], 6, LETTER_RULESET)).toBe(5000);
  });

  it("has no pairs or two-triplets rules", () => {
    const combos = kinds([G, G, R, R, Eblack, Eblack], LETTER_RULESET);
    expect(combos).not.toContain("three-pairs");
    expect(combos).not.toContain("two-triplets");
  });
});

describe("combinations that span faces", () => {
  it("offers a straight only for one of each face", () => {
    expect(kinds([1, 2, 3, 4, 5, 6])).toContain("straight");
    expect(kinds([1, 2, 3, 4, 5, 5])).not.toContain("straight");
  });

  it("offers three pairs for three distinct doubled faces", () => {
    expect(kinds([2, 2, 3, 3, 4, 4])).toContain("three-pairs");
  });

  it("does not call four of a kind plus a pair three pairs", () => {
    expect(kinds([2, 2, 2, 2, 3, 3])).not.toContain("three-pairs");
  });

  it("does not call six of a kind three pairs or two triplets", () => {
    const combos = kinds([2, 2, 2, 2, 2, 2]);
    expect(combos).not.toContain("three-pairs");
    expect(combos).not.toContain("two-triplets");
  });

  it("offers two triplets for two distinct tripled faces", () => {
    expect(kinds([2, 2, 2, 3, 3, 3])).toContain("two-triplets");
  });

  it("offers four plus a pair only when the rule is enabled", () => {
    expect(kinds([2, 2, 2, 2, 3, 3])).not.toContain("four-plus-pair");
    const withRule: Ruleset = { ...DEFAULT_RULESET, fourPlusPair: 1500 };
    expect(kinds([2, 2, 2, 2, 3, 3], withRule)).toContain("four-plus-pair");
  });

  it("omits the disabled ones", () => {
    const combos = kinds([1, 2, 3, 4, 5, 6], MINIMAL_RULESET);
    expect(combos).not.toContain("straight");
    expect(combos).not.toContain("three-pairs");
  });
});

describe("combo shape", () => {
  it("declares exactly the dice it consumes, and its own size", () => {
    // Three 1s offer both the single and the triple; pick the triple.
    const triple = combosFor([1, 1, 1]).find(
      (combo) => combo.kind === "of-a-kind" && combo.size === 3,
    );
    expect(triple?.counts).toEqual([3, 0, 0, 0, 0, 0]);
    expect(triple?.points).toBe(1000);
  });

  it("names the face for of-a-kind and leaves it null for spanning combos", () => {
    expect(combosFor([4, 4, 4]).find((c) => c.kind === "of-a-kind")?.face).toBe(4);
    expect(combosFor([2, 2, 3, 3, 4, 4]).find((c) => c.kind === "three-pairs")?.face).toBeNull();
  });

  it("gives every spanning combo a size matching its counts", () => {
    for (const combo of combosFor([1, 2, 3, 4, 5, 6])) {
      const consumed = combo.counts.reduce((total, n) => total + n, 0);
      expect(combo.size).toBe(consumed);
    }
  });
});

describe("comboGateKey", () => {
  it("ignores point values that do not cross zero", () => {
    const richer: Ruleset = { ...DEFAULT_RULESET, straight: 9999 };
    expect(comboGateKey(richer)).toBe(comboGateKey(DEFAULT_RULESET));
  });

  it("changes when a combination is switched off", () => {
    expect(comboGateKey(MINIMAL_RULESET)).not.toBe(comboGateKey(DEFAULT_RULESET));
  });

  it("separates rulesets whose face tables gate differently", () => {
    expect(comboGateKey(LETTER_RULESET)).not.toBe(comboGateKey(DEFAULT_RULESET));
  });
});
