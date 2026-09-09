import { describe, expect, it } from "vitest";
import { BASE, FAVOUR_PER_CHIPS, MAX, UPGRADES, favoursFor, numbersFor } from "./ladder.js";

describe("the ladder", () => {
  it("starts at the base numbers when nothing is bought", () => {
    expect(numbersFor([])).toEqual(BASE);
  });

  it("adds one upgrade's contribution", () => {
    expect(numbersFor(["glass"])).toEqual({ brim: 1500, trickle: 60, scoop: 35 });
  });

  it("adds several, in any order, to the same place", () => {
    const one = numbersFor(["glass", "spot", "stool"]);
    const other = numbersFor(["stool", "glass", "spot"]);
    expect(one).toEqual(other);
    expect(one).toEqual({ brim: 2250, trickle: 80, scoop: 35 });
  });

  it("ignores an id that is not on the ladder", () => {
    // A client can send anything. An unknown upgrade buys nothing rather than
    // crashing the handler that is holding somebody's chips.
    expect(numbersFor(["glass", "not-a-thing"])).toEqual(numbersFor(["glass"]));
  });

  it("counts each upgrade once however many times it appears", () => {
    expect(numbersFor(["glass", "glass", "glass"])).toEqual(numbersFor(["glass"]));
  });

  it("derives MAX from the ladder rather than repeating it", () => {
    expect(MAX).toEqual(numbersFor(UPGRADES.map((up) => up.id)));
    // Pinned so a retune that moves the ceiling is visible in the diff.
    expect(MAX).toEqual({ brim: 3000, trickle: 100, scoop: 50 });
  });

  it("costs more than one night's easy favours, so the order is a decision", () => {
    const total = UPGRADES.reduce((sum, up) => sum + up.favours, 0);
    expect(total).toBe(275);
    // 275 favours is 5,500 chips collected: about ninety minutes at base rate.
    expect(total * FAVOUR_PER_CHIPS).toBe(5_500);
  });
});

describe("favours", () => {
  it("come from chips collected, one per twenty", () => {
    expect(favoursFor(0, 100)).toBe(5);
  });

  it("do not double-count the part of a chip already paid for", () => {
    // 19 -> 39 crosses exactly one boundary, not two.
    expect(favoursFor(19, 39)).toBe(1);
  });

  it("give nothing for a payout too small to cross a boundary", () => {
    expect(favoursFor(0, 19)).toBe(0);
    expect(favoursFor(21, 39)).toBe(0);
  });
});
