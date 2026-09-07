// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReelsArt, TileArt } from "./TileArt.js";

describe("the furniture in a tile's corner", () => {
  it("gives the slot machine its reels", () => {
    const { container } = render(<TileArt game="slots" />);
    expect(container.querySelectorAll(".art__piece")).toHaveLength(3);
  });

  it("never puts a transform attribute on a piece the stylesheet moves", () => {
    /*
     * A CSS transform *replaces* an element's transform attribute rather than
     * composing with it. The cabinet rolls .art__piece with a CSS transform,
     * so a piece that also carried its own placement there lost it the moment
     * the stylesheet loaded — all three reels stacked at x=0, outside their
     * clip windows, and the machine rendered as three empty slots.
     *
     * It fails silently and only in the browser, which is why it is pinned
     * here: placement goes on a wrapper, and the moved group carries none.
     */
    const { container } = render(<ReelsArt />);
    const pieces = container.querySelectorAll(".art__piece");
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(piece.getAttribute("transform")).toBeNull();
    }
  });

  it("still places each reel across the drawing", () => {
    // The placement has to live somewhere — on the wrapper, not the piece.
    const { container } = render(<ReelsArt />);
    const placed = [...container.querySelectorAll("g[transform^='translate']")];
    expect(placed.length).toBeGreaterThanOrEqual(3);
  });
});
