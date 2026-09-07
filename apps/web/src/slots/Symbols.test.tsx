// @vitest-environment jsdom
import type { Face } from "@backroom/game-slots";
import { FACES } from "@backroom/game-slots";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FACE_SIZE, ReelFace } from "./Symbols.js";

describe("the faces", () => {
  it("has a drawing for every face on the strip", () => {
    /*
     * A missing one does not throw. It renders an empty cell, which looks like
     * a broken machine rather than a broken build and would sit there for a
     * long time before anybody worked out why one reel was sometimes blank.
     */
    for (const face of FACES) {
      const { container } = render(
        <svg aria-hidden="true">
          <ReelFace face={face} />
        </svg>,
      );
      expect(container.querySelector(`[data-face="${face}"]`)).not.toBeNull();
      expect(container.querySelector("path, circle, rect, ellipse")).not.toBeNull();
    }
  });

  it("draws every face inside the same box", () => {
    // So a reel is one grid, and nothing has to be nudged into place.
    expect(FACE_SIZE).toBe(60);
  });

  it("names each face for anybody not looking at it", () => {
    const { container } = render(
      <svg aria-hidden="true">
        <ReelFace face="seven" />
      </svg>,
    );
    expect(container.querySelector("title")?.textContent).toBe("Seven");
  });

  it("names every face, not just the one that was easy", () => {
    for (const face of FACES) {
      const { container } = render(
        <svg aria-hidden="true">
          <ReelFace face={face} />
        </svg>,
      );
      const title = container.querySelector("title")?.textContent ?? "";
      expect(title.length).toBeGreaterThan(0);
      expect(title.toLowerCase()).toContain(face.slice(0, 4));
    }
  });

  it("draws nothing at all rather than throwing on a face it does not know", () => {
    // The wire could carry anything. A blank cell is bad; a blank page is worse.
    const { container } = render(
      <svg aria-hidden="true">
        <ReelFace face={"anvil" as Face} />
      </svg>,
    );
    expect(container.querySelector("[data-face]")).toBeNull();
  });
});
