import { describe, expect, it } from "vitest";
import { LINE_COUNT, PAYLINES, runOn } from "./paylines.js";
import type { Face } from "./strip.js";

/** A grid written the way it looks on the glass: five columns, top row first. */
function grid(...columns: Face[][]): Face[][] {
  return columns;
}
const c: Face = "chip";
const d: Face = "dice";
const s: Face = "seven";

describe("the paylines", () => {
  it("has nine of them, each reading one row per reel", () => {
    expect(PAYLINES).toHaveLength(LINE_COUNT);
    expect(LINE_COUNT).toBe(9);
    for (const line of PAYLINES) {
      expect(line).toHaveLength(5);
      for (const row of line) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThanOrEqual(2);
      }
    }
  });

  it("starts with the middle row, because that is the line people look at", () => {
    // A player reading "line 1" off the glass should find it where they
    // expect, which is straight across the middle.
    expect(PAYLINES[0]).toEqual([1, 1, 1, 1, 1]);
  });

  it("has no two lines the same", () => {
    // A duplicated line pays twice for one row of faces, which is a payout
    // the player cannot see any reason for.
    const seen = new Set(PAYLINES.map((line) => line.join("")));
    expect(seen.size).toBe(LINE_COUNT);
  });
});

describe("reading a line", () => {
  const middle = [1, 1, 1, 1, 1] as const;

  it("counts a run from the leftmost reel", () => {
    const g = grid([c, c, c], [c, c, c], [c, c, c], [c, d, c], [c, c, c]);
    expect(runOn(g, middle)).toEqual({ face: "chip", length: 3 });
  });

  it("counts all five when nothing breaks it", () => {
    const g = grid([c, s, c], [c, s, c], [c, s, c], [c, s, c], [c, s, c]);
    expect(runOn(g, middle)).toEqual({ face: "seven", length: 5 });
  });

  it("stops at the first reel that does not match", () => {
    // A run broken at reel 3 is worth three, not five. Getting this wrong is
    // the classic slot bug: paying for faces that were never in a row.
    const g = grid([c, c, c], [c, c, c], [c, d, c], [c, c, c], [c, c, c]);
    expect(runOn(g, middle)).toEqual({ face: "chip", length: 2 });
  });

  it("does not pay for a run that starts on reel 2", () => {
    // Left to right from reel 1 only. Four sevens starting on reel 2 is a
    // near miss, and has to read as one.
    const g = grid([c, c, c], [c, s, c], [c, s, c], [c, s, c], [c, s, c]);
    expect(runOn(g, middle)).toEqual({ face: "chip", length: 1 });
  });

  it("reads whichever row the line passes through on each reel", () => {
    // The V: top, middle, bottom, middle, top. Every cell it touches is a
    // seven and every cell it misses is not, so a line that read straight
    // across would find nothing here.
    const g = grid([s, c, c], [c, s, c], [c, c, s], [c, s, c], [s, c, c]);
    expect(runOn(g, [0, 1, 2, 1, 0])).toEqual({ face: "seven", length: 5 });
  });

  it("reads every one of the nine lines without falling off the grid", () => {
    const g = grid([c, c, c], [c, c, c], [c, c, c], [c, c, c], [c, c, c]);
    for (const line of PAYLINES) {
      expect(runOn(g, line)).toEqual({ face: "chip", length: 5 });
    }
  });
});
