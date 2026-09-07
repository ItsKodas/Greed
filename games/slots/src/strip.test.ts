import { describe, expect, it } from "vitest";
import { drawGrid, FACES, STOPS, STRIP, WEIGHTS } from "./strip.js";

describe("the strip", () => {
  it("is exactly 32 stops", () => {
    /*
     * Load-bearing. Every probability in this game is a weight over 32, and
     * the closed-form return divides by it. A strip that is 31 or 33 stops
     * long does not fail loudly — it quietly makes every other number here
     * wrong, including the one that decides what the machine can afford.
     */
    const total = FACES.reduce((sum, face) => sum + WEIGHTS[face], 0);
    expect(total).toBe(STOPS);
    expect(STRIP).toHaveLength(STOPS);
  });

  it("puts each face on the strip as many times as it is weighted", () => {
    for (const face of FACES) {
      expect(STRIP.filter((stop) => stop === face)).toHaveLength(WEIGHTS[face]);
    }
  });

  it("draws five columns of three", () => {
    const grid = drawGrid(() => 0);
    expect(grid).toHaveLength(5);
    for (const column of grid) {
      expect(column).toHaveLength(3);
    }
  });

  it("reads three consecutive stops, so a column is a window on the strip", () => {
    // Not three independent draws: a reel is a loop of faces, and the rows
    // above and below the payline are its neighbours. Drawing them separately
    // would make every near miss a lie.
    const grid = drawGrid(() => 0);
    expect(grid[0]).toEqual([STRIP[0], STRIP[1], STRIP[2]]);
  });

  it("wraps round the end of the strip rather than running off it", () => {
    // Stop 31 is the last, and the two below it are the first two again.
    const grid = drawGrid(() => 31 / 32);
    expect(grid[0]).toEqual([STRIP[31], STRIP[0], STRIP[1]]);
  });

  it("never falls off the end, whatever the source of randomness returns", () => {
    // Math.random is specified as [0, 1), but a test roller or a bad shim can
    // hand over 1 exactly, and an undefined face renders as an empty reel.
    for (const value of [0, 0.999_999_999, 1]) {
      for (const column of drawGrid(() => value)) {
        for (const face of column) {
          expect(FACES).toContain(face);
        }
      }
    }
  });
});

describe("the faces, and the wire", () => {
  it("is the same list the protocol carries", async () => {
    /*
     * shared sits beneath the games and cannot import from one, so the faces
     * are written out in both places. This is what stops them drifting: a face
     * the wire does not know arrives at the client as undefined and renders a
     * blank reel, which looks like a broken machine rather than a broken
     * build, and would go unnoticed for a long time.
     */
    const { SPIN_FACES } = await import("@backroom/shared");
    expect([...SPIN_FACES]).toEqual([...FACES]);
  });
});
