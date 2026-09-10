import { POCKETS } from "@backroom/game-roulette";
import { describe, expect, it } from "vitest";
import { BALL, RIM, easing, progress, speed, ticks } from "./spin.js";

describe("how a spin loses its speed", () => {
  it("starts at full speed and ends stopped", () => {
    for (const profile of [RIM, BALL]) {
      expect(speed(profile, 0)).toBeCloseTo(1, 6);
      expect(speed(profile, 1)).toBeCloseTo(0, 6);
    }
  });

  it("never speeds back up", () => {
    // A profile that rises anywhere is a wheel that gets a shove mid-spin.
    for (const profile of [RIM, BALL]) {
      let last = Number.POSITIVE_INFINITY;
      for (let step = 0; step <= 200; step += 1) {
        const now = speed(profile, step / 200);
        expect(now).toBeLessThanOrEqual(last + 1e-9);
        last = now;
      }
    }
  });

  it("comes to rest rather than being switched off", () => {
    /*
     * The bug this whole file is the answer to. Exponential decay never
     * reaches zero, so the ball still had 40% of its speed when the animation
     * ended — it was not stopping, it was being cut. Anything still moving at
     * the end here would do the same.
     */
    for (const profile of [RIM, BALL]) {
      expect(speed(profile, 0.999)).toBeLessThan(0.01);
    }
  });

  it("decelerates gently at the end rather than harder and harder", () => {
    /*
     * The other bug. Below a tail of one the deceleration runs away as it
     * settles and the last moment is a hand laid on the wheel. Measured as
     * what it sheds per step: the final steps must not shed more than the
     * ones before them.
     */
    for (const profile of [RIM, BALL]) {
      const sheds = [0.9, 0.95, 0.99].map((t) => speed(profile, t) - speed(profile, t + 0.005));
      expect(sheds[1] as number).toBeLessThanOrEqual((sheds[0] as number) + 1e-9);
      expect(sheds[2] as number).toBeLessThanOrEqual((sheds[1] as number) + 1e-9);
    }
  });

  it("keeps the ball on the rim for most of the first half", () => {
    // A ball on a hard track barely slows; one that sheds evenly reads as
    // rolling on cloth, which is what this was and what it must not go back to.
    expect(speed(BALL, 0.5)).toBeGreaterThan(0.85);
  });

  it("covers the whole distance, and only once", () => {
    for (const profile of [RIM, BALL]) {
      const at = progress(profile);
      expect(at(0)).toBeCloseTo(0, 6);
      expect(at(1)).toBeCloseTo(1, 6);
    }
  });

  it("writes an easing CSS can animate", () => {
    const css = easing(RIM);
    expect(css.startsWith("linear(0, ")).toBe(true);
    expect(css.endsWith(", 1)")).toBe(true);
    // Six decimals, because near the end four has no resolution left to
    // describe a creep and the settle turns into visible steps.
    expect(css).toMatch(/0\.\d{6} /);
  });

  it("ticks once for every pocket that goes past, slowing as it does", () => {
    const beats = ticks(RIM, 4);
    expect(beats.length).toBeGreaterThan(10);
    // In order, and inside the spin.
    for (let at = 1; at < beats.length; at += 1) {
      expect(beats[at] as number).toBeGreaterThan(beats[at - 1] as number);
    }
    expect(beats[0] as number).toBeGreaterThanOrEqual(0);
    expect(beats.at(-1) as number).toBeLessThanOrEqual(1);
    // The gaps grow: that widening is the sound of a wheel running down, and
    // is the entire point of taking these off the rim's own curve.
    const first = (beats[1] as number) - (beats[0] as number);
    const last = (beats.at(-1) as number) - (beats.at(-2) as number);
    expect(last).toBeGreaterThan(first);
  });

  it("clicks once for every pocket, including at full speed", () => {
    /*
     * One per pocket, all the way through. An earlier version dropped anything
     * within 55ms of the last click, which at fifty pockets a second deleted
     * almost the whole fast phase and left a faint ticking through the tail —
     * the opposite of a wheel running down.
     */
    const turns = 4;
    const beats = ticks(RIM, turns);
    expect(beats.length).toBe(turns * POCKETS);
  });

  it("ticks fastest at the start and slowest at the end", () => {
    // The rate is the rotation, so it has to fall the way the speed does.
    const beats = ticks(RIM, 4);
    const early = (beats[3] as number) - (beats[2] as number);
    const late = (beats.at(-1) as number) - (beats.at(-2) as number);
    expect(late).toBeGreaterThan(early * 3);
  });
});
