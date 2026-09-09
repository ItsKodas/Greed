import { SPOTS, spotAt } from "@backroom/game-roulette";
import { describe, expect, it } from "vitest";
import { ANCHORS, HEIGHT, ROWS, WIDTH, boxOf, nearest } from "./cloth.js";

const at = (spotId: string) => {
  const anchor = ANCHORS.find((one) => one.spotId === spotId);
  if (anchor === undefined) throw new Error(`no anchor for ${spotId}`);
  return anchor;
};

describe("the cloth's geometry", () => {
  it("puts every inside bet somewhere, and somewhere real", () => {
    /*
     * The felt and the rules have to name the same 157 things. An anchor for a
     * spot the server has never heard of is a chip that vanishes on the way
     * out; a spot with no anchor is a bet nobody can place. Both are silent.
     */
    for (const anchor of ANCHORS) {
      expect(spotAt(anchor.spotId), anchor.spotId).not.toBeNull();
    }
  });

  it("reaches every bet on the cloth", () => {
    const placed = new Set(ANCHORS.map((one) => one.spotId));
    const missing = [...SPOTS.keys()].filter((id) => !placed.has(id));
    expect(missing).toEqual([]);
  });

  it("names each spot once", () => {
    const ids = ANCHORS.map((one) => one.spotId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("centres a straight-up on its own square", () => {
    // 1 is bottom-left of the grid, in the first column.
    expect(at("straight:1")).toMatchObject({ x: 1.5, y: 2.5 });
    // 3 is top-left. The zero takes the column before it.
    expect(at("straight:3")).toMatchObject({ x: 1.5, y: 0.5 });
    expect(at("straight:0")).toMatchObject({ x: 0.5, y: 1.5 });
  });

  it("puts a split on the line the two numbers share", () => {
    // 1 and 2 are stacked, so their line is horizontal between them.
    expect(at("split:1-2")).toMatchObject({ x: 1.5, y: 2 });
    // 1 and 4 are side by side, so their line is vertical.
    expect(at("split:1-4")).toMatchObject({ x: 2, y: 2.5 });
  });

  it("puts a corner exactly where four squares meet", () => {
    expect(at("corner:1-2-4-5")).toMatchObject({ x: 2, y: 2 });
  });

  it("puts a street and a six line on the outside edge", () => {
    // Below the column, which is where a chip for the whole row goes.
    expect(at("street:1-2-3")).toMatchObject({ x: 1.5, y: 3 });
    // And on the corner of that edge, between two streets.
    expect(at("six:1-2-3-4-5-6")).toMatchObject({ x: 2, y: 3 });
  });

  it("snaps a tap to the nearest thing that can be bet on", () => {
    // Dead centre of the 1 square.
    expect(nearest(1.5, 2.5)).toBe("straight:1");
    // Nudged towards the line it shares with 2.
    expect(nearest(1.5, 2.05)).toBe("split:1-2");
    // Right on the four-way.
    expect(nearest(2.02, 2.03)).toBe("corner:1-2-4-5");
  });

  it("prefers the square when a tap is closer to the square than the line", () => {
    /*
     * The one that decides whether this mechanism is usable. A straight-up is
     * the commonest inside bet and the easiest to mean, so a tap that is
     * plainly inside a number must not drift onto its edge.
     */
    expect(nearest(1.5, 2.4)).toBe("straight:1");
    expect(nearest(1.6, 2.6)).toBe("straight:1");
  });

  it("refuses a tap that is nowhere near the cloth", () => {
    expect(nearest(-8, -8)).toBeNull();
    expect(nearest(50, 50)).toBeNull();
  });

  it("lays the outside bets out below the numbers, without overlapping them", () => {
    const dozen = boxOf("dozen:1-2-3-4-5-6-7-8-9-10-11-12");
    expect(dozen).not.toBeNull();
    expect(dozen?.y).toBeGreaterThanOrEqual(ROWS);
    const red = boxOf("even:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36");
    expect(red?.y).toBeGreaterThanOrEqual(ROWS);
  });

  it("keeps every anchor inside the cloth it is drawn on", () => {
    // The component scales the cloth to WIDTH x HEIGHT, so an anchor outside
    // that is a chip drawn somewhere the player cannot see or reach.
    for (const anchor of ANCHORS) {
      expect(anchor.x, anchor.spotId).toBeGreaterThanOrEqual(0);
      expect(anchor.x, anchor.spotId).toBeLessThanOrEqual(WIDTH);
      expect(anchor.y, anchor.spotId).toBeGreaterThanOrEqual(0);
      expect(anchor.y, anchor.spotId).toBeLessThanOrEqual(HEIGHT);
    }
  });
});
