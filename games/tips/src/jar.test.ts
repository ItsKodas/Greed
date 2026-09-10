import { describe, expect, it } from "vitest";
import { levelAt, type Jar, type Numbers } from "./jar.js";

const NUMBERS: Numbers = { brim: 1500, trickle: 60, scoop: 25 };

function jar(over: Partial<Jar> = {}): Jar {
  return {
    level: 0,
    levelAt: 0,
    favours: 0,
    bought: [],
    nightStartedAt: 0,
    paidThisNight: 0,
    token: "t0",
    rhythm: [],
    lastTapAt: null,
    ...over,
  };
}

describe("the level", () => {
  it("is what was there when nothing has passed", () => {
    expect(levelAt(jar({ level: 400, levelAt: 1000 }), NUMBERS, 1000)).toBe(400);
  });

  it("rises by the trickle, which is chips per minute", () => {
    // Ten minutes at 60/min is 600 on top of 400.
    expect(levelAt(jar({ level: 400, levelAt: 0 }), NUMBERS, 10 * 60_000)).toBe(1000);
  });

  it("keeps fractions, because a tap can land half a chip into a minute", () => {
    expect(levelAt(jar({ level: 0, levelAt: 0 }), NUMBERS, 500)).toBeCloseTo(0.5, 6);
  });

  it("stops at the brim however long it is left", () => {
    expect(levelAt(jar({ level: 0, levelAt: 0 }), NUMBERS, 7 * 24 * 3600_000)).toBe(1500);
  });

  it("never runs backwards when a clock does", () => {
    // A client's clock is not ours and a server's can be stepped. Neither is a
    // reason to hand somebody a jar with less in it than they left.
    expect(levelAt(jar({ level: 400, levelAt: 5000 }), NUMBERS, 1000)).toBe(400);
  });

  it("leaves a level above the brim alone rather than seizing it", () => {
    // A night turnover drops the brim back to base while the jar is still
    // full from a fully upgraded night. Those chips were earned.
    expect(levelAt(jar({ level: 3000, levelAt: 0 }), NUMBERS, 60_000)).toBe(3000);
  });
});
