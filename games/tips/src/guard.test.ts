import { describe, expect, it } from "vitest";
import { guardCeiling, withinGuard } from "./guard.js";
import { MAX } from "./ladder.js";

/**
 * The property this whole game rests on.
 *
 * Everything else in this package is a clicker. This is what makes it one the
 * building is allowed to run: chips cannot arrive faster than the fastest the
 * game could conceivably pay, and that figure is derived from the ladder
 * rather than from a number somebody felt was safe enough.
 */
describe("the guard", () => {
  it("allows a full jar at the instant a night opens", () => {
    // A level carried in from the night before is real and payable.
    expect(guardCeiling(0, 0)).toBe(MAX.brim);
  });

  it("rises by the fastest trickle the ladder can buy", () => {
    expect(guardCeiling(0, 60_000)).toBe(MAX.brim + MAX.trickle);
    expect(guardCeiling(0, 30 * 60_000)).toBe(MAX.brim + 30 * MAX.trickle);
  });

  it("sits exactly on a fully upgraded jar, with no slack", () => {
    // The tightest honest jar: brim-full at the turnover, then drinking the
    // top trickle for eight hours. It must be allowed, and nothing more.
    const eightHours = 8 * 60 * 60_000;
    const mostPayable = MAX.brim + (MAX.trickle * eightHours) / 60_000;
    expect(withinGuard(0, mostPayable, 0, eightHours)).toBe(true);
    expect(withinGuard(0, mostPayable + 1, 0, eightHours)).toBe(false);
  });

  it("counts what has already been paid this night", () => {
    expect(withinGuard(MAX.brim, 1, 0, 0)).toBe(false);
    expect(withinGuard(MAX.brim - 1, 1, 0, 0)).toBe(true);
  });

  it("does not run backwards when a clock does", () => {
    expect(guardCeiling(5000, 1000)).toBe(MAX.brim);
  });
});
