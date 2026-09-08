import { describe, expect, it } from "vitest";
import { BONUS_AWARDS, countScatters, freeSpinsFor, MIN_SCATTER } from "./scatter.js";
import type { Face } from "./strip.js";

const t: Face = "tumbler";
const b: Face = "bonus";

/** Five columns of three, the way it looks on the glass. */
function grid(...columns: Face[][]): Face[][] {
  return columns;
}

describe("counting the bonus", () => {
  it("finds nothing on a grid without one", () => {
    expect(countScatters(grid([t, t, t], [t, t, t], [t, t, t], [t, t, t], [t, t, t]))).toBe(0);
  });

  it("counts a reel wherever on it the bonus landed", () => {
    // A scatter does not care about rows, which is the whole point of one.
    expect(countScatters(grid([b, t, t], [t, b, t], [t, t, b], [t, t, t], [t, t, t]))).toBe(3);
  });

  it("counts a reel once however many bonuses are on it", () => {
    /*
     * Today the strip holds one bonus stop, so a reel cannot show two and this
     * cannot happen. It is asserted anyway: the strip is a table somebody may
     * retune, and a scatter that quietly started counting a stacked pair as
     * two would make the machine more generous without anybody deciding it
     * should.
     */
    expect(countScatters(grid([b, b, b], [t, t, t], [t, t, t], [t, t, t], [t, t, t]))).toBe(1);
  });

  it("counts all five when every reel has one", () => {
    expect(countScatters(grid([b, t, t], [b, t, t], [b, t, t], [b, t, t], [b, t, t]))).toBe(5);
  });
});

describe("what the bonus awards", () => {
  it("gives nothing for fewer than three", () => {
    for (let scatters = 0; scatters < MIN_SCATTER; scatters += 1) {
      expect(freeSpinsFor(scatters)).toBe(0);
    }
  });

  it("gives more for more of them", () => {
    expect(freeSpinsFor(3)).toBeGreaterThan(0);
    expect(freeSpinsFor(4)).toBeGreaterThan(freeSpinsFor(3));
    expect(freeSpinsFor(5)).toBeGreaterThan(freeSpinsFor(4));
  });

  it("matches the table it is written from", () => {
    for (const [scatters, spins] of Object.entries(BONUS_AWARDS)) {
      expect(freeSpinsFor(Number(scatters))).toBe(spins);
    }
  });

  it("awards the most it knows about rather than nothing for a better result", () => {
    /*
     * Six reels is not a thing this machine can do. But a table read that
     * silently pays nothing for a result *better* than any it lists is the
     * wrong way round to fail, and it would fail on the rarest spin there is.
     */
    expect(freeSpinsFor(6)).toBe(freeSpinsFor(5));
    expect(freeSpinsFor(99)).toBe(freeSpinsFor(5));
  });

  it("never awards a fraction of a spin", () => {
    for (let scatters = 0; scatters <= 5; scatters += 1) {
      expect(Number.isInteger(freeSpinsFor(scatters))).toBe(true);
    }
  });
});
