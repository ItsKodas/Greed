// @vitest-environment jsdom
import { FACES } from "@backroom/game-slots";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReelsArt, TileArt } from "./TileArt.js";

describe("the furniture in a tile's corner", () => {
  it("gives the slot machine as many reels as the machine has", () => {
    // Five, because the machine has five. It drew three for a long time, which
    // is a card advertising a different game.
    const { container } = render(<TileArt game="slots" />);
    expect(container.querySelectorAll(".art__piece")).toHaveLength(5);
  });

  it("shows faces that are actually on the strip", () => {
    /*
     * It drew chips and bells long after both had been taken off the reels,
     * and nothing noticed: the art was its own copy of the faces, kept in step
     * by somebody remembering to. It borrows the machine's drawings now, and
     * this is what stops it drifting again — FACES is the strip itself.
     */
    const { container } = render(<TileArt game="slots" />);
    const drawn = [...container.querySelectorAll("[data-face]")].map((face) =>
      face.getAttribute("data-face"),
    );
    expect(drawn.length).toBeGreaterThan(0);
    for (const face of drawn) {
      expect(FACES).toContain(face);
    }
  });

  it("shows more than one face, so the card is not a jackpot", () => {
    // Five identical strips would roll into a row of the same thing, which is
    // a win on a card advertising a machine nobody has played.
    const { container } = render(<TileArt game="slots" />);
    const drawn = new Set(
      [...container.querySelectorAll("[data-face]")].map((face) => face.getAttribute("data-face")),
    );
    expect(drawn.size).toBeGreaterThan(2);
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
