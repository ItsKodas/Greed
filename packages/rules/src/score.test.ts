import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, MINIMAL_RULESET } from "./rulesets.js";
import { scoreSelection } from "./score.js";
import type { Ruleset } from "./types.js";

describe("validity", () => {
  it("rejects an empty selection", () => {
    const result = scoreSelection([], DEFAULT_RULESET);
    expect(result.valid).toBe(false);
    expect(result.points).toBe(0);
  });

  it("rejects a selection containing a die that cannot score", () => {
    expect(scoreSelection([1, 3], DEFAULT_RULESET).valid).toBe(false);
  });

  it("accepts a selection where every die is consumed", () => {
    expect(scoreSelection([1, 5], DEFAULT_RULESET).valid).toBe(true);
  });

  it("rejects a lone non-scoring die", () => {
    expect(scoreSelection([4], DEFAULT_RULESET).valid).toBe(false);
  });

  it("rejects a triple worth zero points instead of scoring it at zero", () => {
    // Face 2 has no single-die score, so this isolates the n-of-a-kind gate.
    // Strip every of-a-kind value, leaving only the singles on 1 and 5.
    const zeroed: Ruleset = {
      ...DEFAULT_RULESET,
      faces: [
        [100, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [50, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
    };
    const result = scoreSelection([2, 2, 2], zeroed);
    expect(result.valid).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe("basic scoring", () => {
  it("adds singles", () => {
    expect(scoreSelection([1, 1, 5], DEFAULT_RULESET).points).toBe(250);
  });

  it("scores a triple of ones", () => {
    expect(scoreSelection([1, 1, 1], DEFAULT_RULESET).points).toBe(1000);
  });

  it("scores a straight", () => {
    expect(scoreSelection([1, 2, 3, 4, 5, 6], DEFAULT_RULESET).points).toBe(1500);
  });
});

describe("maximum partition", () => {
  it("prefers two triplets over two separate triples", () => {
    // Two triplets is 2500; three 1s plus three 5s is 1000 + 500 = 1500.
    expect(scoreSelection([1, 1, 1, 5, 5, 5], DEFAULT_RULESET).points).toBe(2500);
  });

  it("falls back to separate triples when two triplets is disabled", () => {
    const rules: Ruleset = { ...DEFAULT_RULESET, twoTriplets: null };
    expect(scoreSelection([1, 1, 1, 5, 5, 5], rules).points).toBe(1500);
  });

  it("prefers four of a kind over a triple plus a single", () => {
    // Four 1s: 1000 * 2 = 2000, versus 1000 + 100 = 1100.
    expect(scoreSelection([1, 1, 1, 1], DEFAULT_RULESET).points).toBe(2000);
  });

  it("prefers a triple plus singles when that scores higher", () => {
    // Three 2s (200) plus two 1s (200) = 400. No larger partition exists.
    expect(scoreSelection([2, 2, 2, 1, 1], DEFAULT_RULESET).points).toBe(400);
  });

  it("prefers three pairs over the singles inside it", () => {
    // Three pairs is 750; the 1s and 5s alone would be 100+100+50+50 = 300,
    // and that partition also leaves the 3s dead, so it is not even valid.
    expect(scoreSelection([1, 1, 3, 3, 5, 5], DEFAULT_RULESET).points).toBe(750);
  });

  it("prefers a straight over the singles inside it", () => {
    const rules: Ruleset = { ...DEFAULT_RULESET, straight: 1500 };
    expect(scoreSelection([1, 2, 3, 4, 5, 6], rules).points).toBe(1500);
  });

  it("prefers six of a kind over two triplets of the same face", () => {
    // Six 2s: triple 200 * 8 = 1600. Two triplets requires distinct faces,
    // so it does not apply here at all.
    expect(scoreSelection([2, 2, 2, 2, 2, 2], DEFAULT_RULESET).points).toBe(1600);
  });

  it("scores five of a kind plus a scoring single", () => {
    // Five 2s (200 * 4 = 800) plus a single 1 (100).
    expect(scoreSelection([2, 2, 2, 2, 2, 1], DEFAULT_RULESET).points).toBe(900);
  });
});

describe("breakdown", () => {
  it("reports the combinations that produced the score", () => {
    const result = scoreSelection([1, 1, 1, 5], DEFAULT_RULESET);
    expect(result.points).toBe(1050);
    const kinds = result.breakdown.map((combo) => combo.kind).sort();
    expect(kinds).toEqual(["of-a-kind", "of-a-kind"]);
  });

  it("produces a breakdown consuming exactly the selected dice", () => {
    const result = scoreSelection([1, 1, 5, 5], DEFAULT_RULESET);
    const consumed = result.breakdown.reduce(
      (total, combo) => total + combo.counts.reduce((sum, n) => sum + n, 0),
      0,
    );
    expect(consumed).toBe(4);
  });
});

describe("minimal ruleset", () => {
  it("does not score a straight", () => {
    // 1 and 5 score; 2, 3, 4 and 6 are dead, so the selection is invalid.
    expect(scoreSelection([1, 2, 3, 4, 5, 6], MINIMAL_RULESET).valid).toBe(false);
  });

  it("still scores ones and fives", () => {
    expect(scoreSelection([1, 5], MINIMAL_RULESET).points).toBe(150);
  });
});

describe("purity", () => {
  it("does not mutate the dice passed in", () => {
    const dice = [1, 1, 1, 5, 5, 5] as const;
    scoreSelection(dice, DEFAULT_RULESET);
    expect(dice).toEqual([1, 1, 1, 5, 5, 5]);
  });
});
