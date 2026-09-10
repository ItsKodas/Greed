// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { RoomFireworks, roomVolleys } from "./RoomFireworks.js";

/** A desktop with the machine in the middle and room either side of it. */
const VIEWPORT = { width: 1280, height: 900 };
const CABINET = { left: 360, right: 920, top: 120, bottom: 820 };
const COLOURS = ["#ff86d4", "#e0b048"];

const volleys = (shells: number) => roomVolleys(shells, CABINET, VIEWPORT, COLOURS);
const every = (shells: number) => volleys(shells).flatMap((volley) => volley.shells);

describe("fireworks off the sides of the machine", () => {
  it("throws nothing at all for a win that stayed on the glass", () => {
    expect(volleys(0)).toHaveLength(0);
  });

  it("sends up every shell it was given", () => {
    expect(every(9)).toHaveLength(9);
  });

  it("uses both sides of the machine", () => {
    const sides = every(8).map((shell) => Math.sign(shell.vx));
    expect(sides).toContain(-1);
    expect(sides).toContain(1);
  });

  it("starts them at the edges of the cabinet, not in the middle of it", () => {
    for (const shell of every(8)) {
      expect([CABINET.left, CABINET.right]).toContain(shell.x);
    }
  });

  it("throws them away from the machine rather than across it", () => {
    for (const shell of every(8)) {
      // Left edge outward is leftward, right edge outward is rightward. A
      // shell crossing the cabinet would burst behind it, where the cabinet
      // is sitting on top of this canvas and nobody would see it.
      expect(Math.sign(shell.vx)).toBe(shell.x === CABINET.left ? -1 : 1);
    }
  });

  it("aims all of them upward", () => {
    for (const shell of every(8)) {
      expect(shell.vy).toBeLessThan(0);
    }
  });

  it("starts them up the flank of the machine, not off its floor", () => {
    for (const shell of every(8)) {
      expect(shell.y).toBeGreaterThan(CABINET.top);
      expect(shell.y).toBeLessThan(CABINET.bottom);
    }
  });

  it("spreads a bigger win over more volleys, so it lasts longer", () => {
    expect(volleys(14).length).toBeGreaterThan(volleys(3).length);
  });

  it("lets the first volley go at once", () => {
    expect(volleys(9)[0]?.after).toBe(0);
  });
});

describe("the room's canvas", () => {
  it("hangs on the page rather than inside the machine", () => {
    // Portalled out to the body: inside the cabinet it would be clipped to the
    // cabinet, which is the one place this show is not supposed to be.
    const { container } = render(<RoomFireworks fire={1} shells={6} from={createRef()} />);
    expect(container.querySelector(".room-fireworks")).toBeNull();
    expect(document.body.querySelector(".room-fireworks canvas")).not.toBeNull();
  });

  it("says nothing to a screen reader", () => {
    render(<RoomFireworks fire={1} shells={6} from={createRef()} />);
    expect(document.body.querySelector(".room-fireworks")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
