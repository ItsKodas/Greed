// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Face } from "@backroom/game-slots";
import { HOLD_MS, holdsFor, PaylineOverlay } from "./Slots.js";

describe("a win", () => {
  it("lights every line that paid", () => {
    const { container } = render(
      <PaylineOverlay
        lines={[
          { line: 0, face: "chip", length: 3, pay: 400 },
          { line: 3, face: "bell", length: 5, pay: 8750 },
        ]}
      />,
    );
    expect(container.querySelectorAll(".payline")).toHaveLength(2);
    expect(container.querySelector('[data-line="3"]')).not.toBeNull();
  });

  it("draws a line only as far as the run actually reached", () => {
    /*
     * A line drawn the whole width for a run of three is the machine claiming
     * a win the player cannot see on the glass. Three points, not five.
     */
    const { container } = render(
      <PaylineOverlay lines={[{ line: 0, face: "chip", length: 3, pay: 400 }]} />,
    );
    const drawn = container.querySelector(".payline");
    expect(drawn?.getAttribute("data-length")).toBe("3");
    expect(drawn?.getAttribute("points")?.trim().split(/\s+/)).toHaveLength(3);
  });

  it("draws each line through the middle of the cells it passes", () => {
    // The middle line runs straight across the centre row of a 500x300 box.
    const { container } = render(
      <PaylineOverlay lines={[{ line: 0, face: "chip", length: 5, pay: 400 }]} />,
    );
    expect(container.querySelector(".payline")?.getAttribute("points")).toBe(
      "50,150 150,150 250,150 350,150 450,150",
    );
  });

  it("follows a diagonal rather than flattening it", () => {
    // Line 3 is the V: top, middle, bottom, middle, top.
    const { container } = render(
      <PaylineOverlay lines={[{ line: 3, face: "bell", length: 5, pay: 8750 }]} />,
    );
    expect(container.querySelector(".payline")?.getAttribute("points")).toBe(
      "50,50 150,150 250,250 350,150 450,50",
    );
  });

  it("stretches over the glass rather than keeping its own shape", () => {
    // The reels fill the box; an overlay that preserved its aspect ratio would
    // sit a line down the middle of nothing.
    const { container } = render(
      <PaylineOverlay lines={[{ line: 0, face: "chip", length: 3, pay: 400 }]} />,
    );
    expect(container.querySelector("svg")?.getAttribute("preserveAspectRatio")).toBe("none");
  });

  it("shows nothing at all when nothing paid", () => {
    const { container } = render(<PaylineOverlay lines={[]} />);
    expect(container.querySelectorAll(".payline")).toHaveLength(0);
  });
});

/**
 * How long the machine takes to say what it already knows.
 *
 * The server sends the whole grid at once, so none of this guesses at
 * anything — it only decides which reels are worth drawing out. Getting it
 * wrong is not a wrong answer, it is a machine that shrugs through a line of
 * sevens or makes a meal of three chips.
 */
describe("holding a reel back", () => {
  const g = (...columns: Face[][]) => columns;
  const c: Face = "chip";
  const d: Face = "dice";
  const s7: Face = "seven";
  const b: Face = "bell";

  it("does not hold anything on an ordinary spin", () => {
    // Alternating reels drawn from two faces that never meet, so no payline
    // can start a run at all. Writing this by eye is how the first version of
    // this test ended up with three bells down the peak line.
    const grid = g([c, c, c], [d, d, d], [c, c, c], [d, d, d], [c, c, c]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, 0, 0]);
  });

  it("does not make a meal of three small ones", () => {
    // Three chips pays, but it is not a moment, and treating it as one makes
    // every spin feel the same.
    const grid = g([c, c, c], [c, c, c], [c, c, c], [d, d, d], [d, d, d]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, 0, 0]);
  });

  it("holds the fourth reel when three sevens are already up", () => {
    const grid = g([s7, s7, s7], [s7, s7, s7], [s7, s7, s7], [d, d, d], [d, d, d]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, HOLD_MS, 0]);
  });

  it("holds the last reel too once four are up", () => {
    const grid = g([s7, s7, s7], [s7, s7, s7], [s7, s7, s7], [s7, s7, s7], [d, d, d]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, HOLD_MS, HOLD_MS]);
  });

  it("holds for four of anything, however cheap", () => {
    // Four across is one reel from a five of anything, which is worth the wait
    // whatever the face turns out to be.
    const grid = g([c, c, c], [c, c, c], [c, c, c], [c, c, c], [d, d, d]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, HOLD_MS, HOLD_MS]);
  });

  it("draws out the whole way on a five of a kind", () => {
    const grid = g([s7, s7, s7], [s7, s7, s7], [s7, s7, s7], [s7, s7, s7], [s7, s7, s7]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, HOLD_MS, HOLD_MS]);
  });

  it("holds for bells as well as sevens", () => {
    const grid = g([b, b, b], [b, b, b], [b, b, b], [d, d, d], [d, d, d]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, HOLD_MS, 0]);
  });

  it("never holds a reel the answer no longer rides on", () => {
    // A run that died on reel two: nothing after it is worth waiting for.
    const grid = g([s7, s7, s7], [s7, s7, s7], [d, d, d], [s7, s7, s7], [s7, s7, s7]);
    expect(holdsFor(grid)).toEqual([0, 0, 0, 0, 0]);
  });
});

