// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { credits, CREDITS_PER_CHIP, PaylineOverlay } from "./Slots.js";

/**
 * Credits are a display convention, not a currency.
 *
 * There is one ledger in this building and it is in chips. The glass reads in
 * credits because a machine that says 500 feels like a slot machine and one
 * that says 5 does not — but the multiplication happens on the way to the
 * screen, and nothing underneath ever stores a credit.
 */
describe("the glass", () => {
  it("reads a hundred credits to the chip", () => {
    expect(CREDITS_PER_CHIP).toBe(100);
    expect(credits(5)).toBe("500");
  });

  it("groups a large number so it can be read at a glance", () => {
    expect(credits(50_000)).toBe("5,000,000");
  });

  it("shows nothing as nothing", () => {
    expect(credits(0)).toBe("0");
  });
});

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
