import { describe, expect, it } from "vitest";
import { SPOTS, type Spot, kindsOf, pays, spotAt } from "./spots.js";
import { WHEEL } from "./wheel.js";

const all = () => [...SPOTS.values()];

describe("the layout", () => {
  it("pays every spot at thirty-six over what it covers", () => {
    /*
     * The whole paytable, as one rule. A straight covers one pocket and pays
     * 35 to 1; a corner covers four and pays 8; red covers eighteen and pays
     * even money. Writing the odds out by hand instead would be 157 chances to
     * mistype one, and every one of them would be a spot that quietly pays the
     * wrong amount forever.
     */
    for (const spot of all()) {
      expect(pays(spot)).toBe(36 / spot.covers.length - 1);
      // The same rule said the other way round: what you win against what you
      // had to cover to win it. Two spellings, so a typo in one is not silent.
      expect(pays(spot)).toBe((36 - spot.covers.length) / spot.covers.length);
    }
  });

  it("only ever pays a whole number of chips per chip staked", () => {
    // Which is not a given: it holds because every legal spot covers a divisor
    // of 36. A spot covering five pockets would pay 6.2 and there is no such
    // chip, so a new spot that broke this would be caught here rather than in
    // somebody's stack.
    for (const spot of all()) {
      expect(Number.isInteger(pays(spot))).toBe(true);
      expect(36 % spot.covers.length).toBe(0);
    }
  });

  it("covers only pockets that exist, and never the same one twice", () => {
    for (const spot of all()) {
      expect(new Set(spot.covers).size).toBe(spot.covers.length);
      for (const pocket of spot.covers) expect(WHEEL).toContain(pocket);
    }
  });

  it("lays out the whole European table and no more", () => {
    expect(kindsOf(all())).toEqual({
      straight: 37,
      split: 60,
      street: 12,
      trio: 2,
      corner: 22,
      basket: 1,
      six: 11,
      column: 3,
      dozen: 3,
      even: 6,
    });
  });

  it("puts a chip on a split only where two numbers actually touch", () => {
    expect(spotAt("split:1-2")).toBeTruthy();
    expect(spotAt("split:1-4")).toBeTruthy();
    // 1 and 7 are a whole row apart, and 3 and 4 are on opposite edges of the
    // cloth — neighbours in counting order, nowhere near each other in the eye.
    expect(spotAt("split:1-7")).toBeNull();
    expect(spotAt("split:3-4")).toBeNull();
  });

  it("takes the corner where four numbers meet, and nowhere else", () => {
    expect(spotAt("corner:1-2-4-5")).toBeTruthy();
    expect(spotAt("corner:2-3-5-6")).toBeTruthy();
    // Would need the cloth to wrap round.
    expect(spotAt("corner:3-4-6-7")).toBeNull();
  });

  it("gives the zero its own splits and the first four", () => {
    expect(spotAt("split:0-1")).toBeTruthy();
    expect(spotAt("trio:0-1-2")).toBeTruthy();
    expect(spotAt("basket:0-1-2-3")?.covers).toEqual([0, 1, 2, 3]);
    expect(pays(spotAt("basket:0-1-2-3") as Spot)).toBe(8);
  });

  it("leaves the zero out of every even-money bet and every dozen", () => {
    // This is the house edge, and it is the only place it comes from. A zero
    // that slipped into red or into the first dozen would be a table that
    // never fills its bank.
    for (const spot of all()) {
      if (spot.kind === "even" || spot.kind === "dozen" || spot.kind === "column") {
        expect(spot.covers).not.toContain(0);
      }
    }
  });

  it("refuses a set of numbers nobody can bet on", () => {
    expect(spotAt("straight:37")).toBeNull();
    expect(spotAt("split:9-9")).toBeNull();
    expect(spotAt("nonsense")).toBeNull();
    expect(spotAt("")).toBeNull();
  });

  it("names every spot once", () => {
    const ids = all().map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
