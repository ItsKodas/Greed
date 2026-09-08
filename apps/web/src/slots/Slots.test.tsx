// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Face } from "@backroom/game-slots";
import { HOLD_MS, holdsFor, Marquee, PaylineOverlay } from "./Slots.js";

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

/**
 * The screen across the top of the machine.
 *
 * One panel doing two jobs: what there is to play for, and what the last pull
 * came to. It is the only place on the cabinet a message can go without
 * pushing the reels down the page every time somebody wins.
 */
describe("the machine's screen", () => {
  const chipLine = (line: number) => ({ line, face: "chip" as const, length: 3, pay: 1000 });

  it("shows what there is to play for when nothing has happened", () => {
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said={null}
        problem={null}
        lines={[]}
        wasJackpot={false}
        showing={false}
      />,
    );
    expect(container.querySelector(".screen__label")?.textContent).toBe("Jackpot");
    // The figure rolls, so the readable value is the one held for a screen
    // reader rather than the ten digits sitting on each column's strip.
    expect(container.querySelector(".roll__said")?.textContent).toBe("3,200,000");
  });

  it("shows the outcome once the reels have finished", () => {
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said="6,000"
        problem={null}
        lines={[chipLine(0), chipLine(1)]}
        wasJackpot={false}
        showing
      />,
    );
    expect(container.querySelector(".screen__label")?.textContent).toBe("Paid");
    expect(container.querySelector(".roll__said")?.textContent).toBe("6,000");
  });

  it("keeps the jackpot up until the reels have actually stopped", () => {
    // The answer is in long before the reels finish saying it; putting the
    // outcome up early would give away what the last reel is still hiding.
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said="6,000"
        problem={null}
        lines={[chipLine(0)]}
        wasJackpot={false}
        showing={false}
      />,
    );
    expect(container.querySelector(".screen__label")?.textContent).toBe("Jackpot");
  });

  it("groups identical wins rather than listing every line", () => {
    /*
     * Three chips across can light six paylines at once, and six rows saying
     * the same thing filled the belly of the machine and said nothing the
     * first row had not. The glass already shows which lines lit.
     */
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said="6,000"
        problem={null}
        lines={[0, 1, 2, 3, 4, 5].map(chipLine)}
        wasJackpot={false}
        showing
      />,
    );
    const rows = [...container.querySelectorAll(".won__row")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("3 × chip");
    expect(rows[0]?.textContent).toContain("on 6 lines");
    // And the total across all six, not one of them.
    expect(rows[0]?.textContent).toContain("6,000");
  });

  it("keeps different wins apart", () => {
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said="9,000"
        problem={null}
        lines={[chipLine(0), { line: 1, face: "bell", length: 5, pay: 8000 }]}
        wasJackpot={false}
        showing
      />,
    );
    expect(container.querySelectorAll(".won__row")).toHaveLength(2);
    // Biggest first: the thing worth looking at is at the top.
    expect(container.querySelectorAll(".won__row")[0]?.textContent).toContain("5 × bell");
  });

  it("says the jackpot in its own words", () => {
    const { container } = render(
      <Marquee
        bank={8_000_000}
        jackpot={3_200_000}
        forFun={false}
        said="3,200,000"
        problem={null}
        lines={[]}
        wasJackpot
        showing
      />,
    );
    expect(container.querySelector(".screen__label")?.textContent).toBe("Jackpot");
    expect(container.querySelector(".won__row--jackpot")?.textContent).toContain("Five sevens");
    expect(container.querySelector(".screen--jackpot")).not.toBeNull();
  });

  it("puts a refusal on the screen rather than swallowing it", () => {
    const { container } = render(
      <Marquee
        bank={0}
        jackpot={0}
        forFun={false}
        said={null}
        problem="The bank is empty."
        lines={[]}
        wasJackpot={false}
        showing={false}
      />,
    );
    expect(container.querySelector(".screen__note--said")?.textContent).toBe("The bank is empty.");
  });
});

