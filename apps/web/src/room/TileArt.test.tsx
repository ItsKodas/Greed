// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/*
 * The drawing and the stylesheet that moves it.
 *
 * These are two files that have to agree on a number, and nothing made them.
 * The art grew from three reels to five and the roll rules stayed at three, so
 * the last two sat perfectly still while the rest rolled — a machine with a
 * broken half. Nothing threw and nothing failed; there was simply no rule to
 * match them, which is the quietest way for a stylesheet to be wrong.
 */
describe("the reels the stylesheet knows how to roll", () => {
  /*
   * Found from the working directory rather than from import.meta.url: this
   * file runs under jsdom, where that is an http URL and not a path at all.
   * Two candidates because the suite can be run from the repository root or
   * from the web package.
   */
  const css = readFileSync(
    [
      resolve(process.cwd(), "apps/web/src/game/game.css"),
      resolve(process.cwd(), "src/game/game.css"),
    ].find((path) => existsSync(path)) as string,
    "utf8",
  );

  /**
   * The stylesheet with every @media block taken out of it.
   *
   * Because a selector inside the reduced-motion block is the *absence* of a
   * roll: searching the whole file for one finds the rule that switches it off
   * and calls that a rule that moves it. Checked without this, removing a
   * reel's roll outright still passed.
   */
  const always = (() => {
    let out = "";
    let at = 0;
    while (at < css.length) {
      const start = css.indexOf("@media", at);
      if (start === -1) {
        out += css.slice(at);
        break;
      }
      out += css.slice(at, start);
      let depth = 0;
      let cursor = css.indexOf("{", start);
      for (; cursor < css.length; cursor += 1) {
        if (css[cursor] === "{") {
          depth += 1;
        } else if (css[cursor] === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
      }
      at = cursor + 1;
    }
    return out;
  })();

  it("has a rule for every reel the machine draws", () => {
    const { container } = render(<TileArt game="slots" />);
    const reels = container.querySelectorAll(".art__piece").length;
    expect(reels).toBeGreaterThan(0);
    for (let reel = 1; reel <= reels; reel += 1) {
      expect(always).toContain(`.cabinet:hover .art__piece--${reel}`);
    }
  });

  it("strips the media blocks it means to strip", () => {
    // The helper above is doing real work, so it gets its own check: a bug in
    // it would make the test above pass for the wrong reason, silently.
    expect(always).not.toContain("prefers-reduced-motion");
    expect(always).toContain(".cabinet:hover .art__piece--1");
  });

  it("turns every one of them off when motion is not wanted", () => {
    const { container } = render(<TileArt game="slots" />);
    const reels = container.querySelectorAll(".art__piece").length;
    /*
     * Every reduced-motion block, not the first — this stylesheet has several,
     * and the cabinet's is a long way down. Taking the first found a block
     * about the navbar and said the reels were unstilled when they were fine.
     */
    const stilled = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
    for (let reel = 1; reel <= reels; reel += 1) {
      const selector = `.cabinet:hover .art__piece--${reel}`;
      expect(stilled.some((block) => block.includes(selector))).toBe(true);
    }
  });
});

