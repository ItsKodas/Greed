import { describe, expect, it } from "vitest";
import {
  combinations,
  contains,
  countsKey,
  emptyCounts,
  facesWithAtLeast,
  fromCounts,
  subtract,
  toCounts,
  totalDice,
} from "./counts.js";

describe("toCounts", () => {
  it("tallies dice by face with index 0 as face 1", () => {
    expect(toCounts([1, 1, 3, 6])).toEqual([2, 0, 1, 0, 0, 1]);
  });

  it("returns all zeros for no dice", () => {
    expect(toCounts([])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("does not mutate its argument", () => {
    const dice = [1, 2, 3] as const;
    toCounts(dice);
    expect(dice).toEqual([1, 2, 3]);
  });
});

describe("fromCounts", () => {
  it("expands counts back into ascending dice", () => {
    expect(fromCounts([2, 0, 1, 0, 0, 1])).toEqual([1, 1, 3, 6]);
  });

  it("round-trips with toCounts", () => {
    expect(fromCounts(toCounts([5, 2, 5, 1]))).toEqual([1, 2, 5, 5]);
  });
});

describe("totalDice", () => {
  it("sums the vector", () => {
    expect(totalDice([1, 2, 0, 0, 3, 0])).toBe(6);
    expect(totalDice(emptyCounts())).toBe(0);
  });
});

describe("contains", () => {
  it("is true when every face has enough dice", () => {
    expect(contains([2, 0, 1, 0, 0, 1], [1, 0, 1, 0, 0, 0])).toBe(true);
  });

  it("is true for an exact match", () => {
    expect(contains([2, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0])).toBe(true);
  });

  it("is false when any face is short", () => {
    expect(contains([1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0])).toBe(false);
  });
});

describe("subtract", () => {
  it("removes counts face by face", () => {
    expect(subtract([2, 0, 1, 0, 0, 1], [1, 0, 1, 0, 0, 0])).toEqual([1, 0, 0, 0, 0, 1]);
  });

  it("does not mutate either argument", () => {
    const from: [number, number, number, number, number, number] = [2, 0, 0, 0, 0, 0];
    const taken: [number, number, number, number, number, number] = [1, 0, 0, 0, 0, 0];
    subtract(from, taken);
    expect(from).toEqual([2, 0, 0, 0, 0, 0]);
    expect(taken).toEqual([1, 0, 0, 0, 0, 0]);
  });
});

describe("countsKey", () => {
  it("is stable and distinguishes different vectors", () => {
    expect(countsKey([1, 0, 0, 0, 0, 0])).toBe(countsKey([1, 0, 0, 0, 0, 0]));
    expect(countsKey([1, 0, 0, 0, 0, 0])).not.toBe(countsKey([0, 1, 0, 0, 0, 0]));
  });
});

describe("facesWithAtLeast", () => {
  it("returns faces meeting the threshold, ascending", () => {
    expect(facesWithAtLeast([2, 3, 0, 1, 2, 0], 2)).toEqual([1, 2, 5]);
  });

  it("returns nothing when no face qualifies", () => {
    expect(facesWithAtLeast([1, 1, 1, 1, 1, 1], 2)).toEqual([]);
  });
});

describe("combinations", () => {
  it("returns every k-subset in order", () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it("returns one empty combination for k of 0", () => {
    expect(combinations([1, 2], 0)).toEqual([[]]);
  });

  it("returns nothing when k exceeds the input length", () => {
    expect(combinations([1, 2], 3)).toEqual([]);
  });
});
