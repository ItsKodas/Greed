import { describe, expect, it } from "vitest";
import { burning, SHOW, type Shell } from "./show.js";

/** A canvas tall enough that the numbers below read as pixels. */
const HEIGHT = 1000;

const shell = (over: Partial<Shell> = {}): Shell => ({
  x: 500,
  y: HEIGHT,
  vx: 0,
  vy: -SHOW.climb * HEIGHT,
  burstAt: HEIGHT * 0.3,
  hue: "#ff86d4",
  ...over,
});

/** Runs the show forward for a while, the way a frame loop would. */
const run = (show: ReturnType<typeof burning>, seconds: number) => {
  for (let n = 0; n < seconds * 60; n += 1) {
    show.advance(1 / 60, HEIGHT);
  }
};

describe("a firework", () => {
  it("has nothing burning before anything is launched", () => {
    expect(burning().alive()).toBe(false);
  });

  it("bursts into sparks when the shell reaches its height", () => {
    const show = burning();
    show.launch(shell());
    run(show, 0.5);
    expect(show.shells).toHaveLength(0);
    expect(show.sparks.length).toBeGreaterThan(0);
  });

  it("bursts at the top of the arc even if the shell never got that high", () => {
    const show = burning();
    // Barely thrown, aimed at a height it cannot reach: it must still go off
    // rather than fall back down the screen as a dot.
    show.launch(shell({ vy: -HEIGHT * 0.2, burstAt: 0 }));
    run(show, 0.5);
    expect(show.shells).toHaveLength(0);
    expect(show.sparks.length).toBeGreaterThan(0);
  });

  it("carries a shell thrown sideways sideways", () => {
    const show = burning();
    show.launch(shell({ x: 100, vx: HEIGHT * 0.9, burstAt: 0, vy: -HEIGHT }));
    show.advance(1 / 60, HEIGHT);
    const [flying] = show.shells;
    expect(flying?.x).toBeGreaterThan(100);
  });

  it("burns out, so nothing is left asking for frames", () => {
    const show = burning();
    show.launch(shell());
    run(show, 6);
    expect(show.alive()).toBe(false);
  });

  it("forgets everything when the show is called off", () => {
    const show = burning();
    show.launch(shell());
    show.clear();
    expect(show.alive()).toBe(false);
  });
});
