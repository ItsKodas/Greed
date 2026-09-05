import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, LETTER_RULESET, MINIMAL_RULESET, RULESETS } from "./rulesets.js";

describe("DEFAULT_RULESET", () => {
  it("is the classic pip game", () => {
    expect(DEFAULT_RULESET.name).toBe("Classic");
    expect(DEFAULT_RULESET.skin).toBe("pips");
    expect(DEFAULT_RULESET.targetScore).toBe(10_000);
    expect(DEFAULT_RULESET.entryThreshold).toBe(500);
  });

  it("scores singles on faces 1 and 5 only", () => {
    const singles = DEFAULT_RULESET.faces.map((face) => face[0]);
    expect(singles).toEqual([100, 0, 0, 0, 50, 0]);
  });

  it("never scores a bare pair", () => {
    for (const face of DEFAULT_RULESET.faces) {
      expect(face[1]).toBe(0);
    }
  });

  it("scores triples at face times 100, with three 1s special", () => {
    const triples = DEFAULT_RULESET.faces.map((face) => face[2]);
    expect(triples).toEqual([1000, 200, 300, 400, 500, 600]);
  });

  it("doubles, quadruples and octuples the triple for four, five and six", () => {
    for (const face of DEFAULT_RULESET.faces) {
      expect(face[3]).toBe(face[2] * 2);
      expect(face[4]).toBe(face[2] * 4);
      expect(face[5]).toBe(face[2] * 8);
    }
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
    expect(Object.isFrozen(DEFAULT_RULESET.faces)).toBe(true);
  });
});

describe("MINIMAL_RULESET", () => {
  it("keeps the pip face table but drops every spanning combination", () => {
    expect(MINIMAL_RULESET.faces).toEqual(DEFAULT_RULESET.faces);
    expect(MINIMAL_RULESET.straight).toBeNull();
    expect(MINIMAL_RULESET.threePairs).toBeNull();
    expect(MINIMAL_RULESET.twoTriplets).toBeNull();
    expect(MINIMAL_RULESET.fourPlusPair).toBeNull();
  });
});

describe("LETTER_RULESET", () => {
  // Faces are $ G R E(black) E(green) D, in that order.
  it("wins at 5,000, half the pip target", () => {
    expect(LETTER_RULESET.targetScore).toBe(5_000);
    expect(LETTER_RULESET.entryThreshold).toBe(500);
    expect(LETTER_RULESET.skin).toBe("letters");
  });

  it("scores D at 100 and G at 50, and nothing else, alone", () => {
    const singles = LETTER_RULESET.faces.map((face) => face[0]);
    expect(singles).toEqual([0, 50, 0, 0, 0, 100]);
  });

  it("runs the triple ladder 600 / 500 / 400 / 300 / 300, with no D triple", () => {
    const triples = LETTER_RULESET.faces.map((face) => face[2]);
    expect(triples).toEqual([600, 500, 400, 300, 300, 0]);
  });

  it("gives both E colours the same triple while keeping them distinct faces", () => {
    expect(LETTER_RULESET.faces[3]?.[2]).toBe(300);
    expect(LETTER_RULESET.faces[4]?.[2]).toBe(300);
    expect(LETTER_RULESET.faces[3]).not.toBe(LETTER_RULESET.faces[4]);
  });

  it("puts D's jackpot at four of a kind", () => {
    const fours = LETTER_RULESET.faces.map((face) => face[3]);
    expect(fours).toEqual([0, 0, 0, 0, 0, 1000]);
  });

  it("pays 5,000 for six of any face", () => {
    for (const face of LETTER_RULESET.faces) {
      expect(face[5]).toBe(5000);
    }
  });

  it("treats $GREED as the straight, worth 1,000", () => {
    expect(LETTER_RULESET.straight).toBe(1000);
  });

  it("has no pairs, triplet-pair or four-plus-pair rules", () => {
    expect(LETTER_RULESET.threePairs).toBeNull();
    expect(LETTER_RULESET.twoTriplets).toBeNull();
    expect(LETTER_RULESET.fourPlusPair).toBeNull();
  });
});

describe("RULESETS", () => {
  it("offers the classic game first, then the letter edition", () => {
    expect(RULESETS.map((rules) => rules.name)).toEqual(["Classic", "Letter dice"]);
  });

  it("gives every offered ruleset a distinct name", () => {
    expect(new Set(RULESETS.map((rules) => rules.name)).size).toBe(RULESETS.length);
  });
});
