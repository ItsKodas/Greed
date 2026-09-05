import { describe, expect, it } from "vitest";
import { enumerateOptions } from "./enumerate.js";
import { DEFAULT_RULESET } from "./rulesets.js";

describe("enumerateOptions", () => {
  it("returns nothing for a busted roll", () => {
    expect(enumerateOptions([2, 3, 4], DEFAULT_RULESET)).toEqual([]);
  });

  it("returns nothing for no dice", () => {
    expect(enumerateOptions([], DEFAULT_RULESET)).toEqual([]);
  });

  it("finds the single scoring die in a roll", () => {
    const options = enumerateOptions([1, 2, 3], DEFAULT_RULESET);
    expect(options).toHaveLength(1);
    expect(options[0]?.points).toBe(100);
    expect(options[0]?.diceUsed).toBe(1);
    expect(options[0]?.counts).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("offers each single and the pair of them", () => {
    // 1 alone, 5 alone, and 1+5 together.
    const options = enumerateOptions([1, 5, 2], DEFAULT_RULESET);
    expect(options.map((option) => option.points)).toEqual([150, 100, 50]);
  });

  it("sorts by points descending", () => {
    const options = enumerateOptions([1, 1, 1, 5], DEFAULT_RULESET);
    const points = options.map((option) => option.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("breaks ties by preferring fewer dice", () => {
    const options = enumerateOptions([1, 1, 5, 5], DEFAULT_RULESET);
    const hundreds = options.filter((option) => option.points === 100);
    // A single 1 (one die) must come before two 5s (two dice).
    expect(hundreds[0]?.diceUsed).toBe(1);
  });

  it("puts the best option first", () => {
    const options = enumerateOptions([1, 1, 1, 5, 5, 5], DEFAULT_RULESET);
    expect(options[0]?.points).toBe(2500);
    expect(options[0]?.diceUsed).toBe(6);
  });

  it("never returns an option using more dice than were rolled", () => {
    const options = enumerateOptions([1, 1, 1, 1, 1, 1], DEFAULT_RULESET);
    for (const option of options) {
      expect(option.diceUsed).toBeLessThanOrEqual(6);
    }
  });

  it("only returns fully scoring selections", () => {
    // The 3 can never be part of any option.
    const options = enumerateOptions([1, 3, 5], DEFAULT_RULESET);
    for (const option of options) {
      expect(option.counts[2]).toBe(0);
    }
  });

  it("includes a breakdown for every option", () => {
    for (const option of enumerateOptions([1, 1, 5], DEFAULT_RULESET)) {
      expect(option.breakdown.length).toBeGreaterThan(0);
    }
  });

  it("does not mutate the dice passed in", () => {
    const dice = [1, 1, 5] as const;
    enumerateOptions(dice, DEFAULT_RULESET);
    expect(dice).toEqual([1, 1, 5]);
  });
});
