import { describe, expect, it } from "vitest";
import { BLACK, colourOf, POCKETS, RED, WHEEL, spin } from "./wheel.js";

describe("the wheel", () => {
  it("has a single zero and the numbers one to thirty-six, once each", () => {
    expect(WHEEL).toHaveLength(POCKETS);
    expect(POCKETS).toBe(37);
    expect([...WHEEL].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 37 }, (_, n) => n),
    );
  });

  it("is in the order the numbers actually sit on a European wheel", () => {
    /*
     * Not decoration. The order is what makes neighbouring pockets alternate
     * colour and what a ball landing "just past" a number means, so a wheel
     * drawn in counting order is a wheel that lies about where the ball went.
     */
    expect(WHEEL[0]).toBe(0);
    expect(WHEEL[1]).toBe(32);
    expect(WHEEL[2]).toBe(15);
    expect(WHEEL.at(-1)).toBe(26);
  });

  it("splits the thirty-six numbers evenly between red and black", () => {
    expect(RED.size).toBe(18);
    expect(BLACK.size).toBe(18);
    for (const n of RED) expect(BLACK.has(n)).toBe(false);
  });

  it("gives zero no colour at all", () => {
    // Every even-money bet loses to zero, which is the whole house edge. A
    // zero that counted as either colour would hand it back.
    expect(colourOf(0)).toBeNull();
    expect(colourOf(32)).toBe("red");
    expect(colourOf(15)).toBe("black");
  });

  it("alternates colour around the wheel, zero aside", () => {
    // A real wheel alternates. This catches a mistyped number in either the
    // order or the colour sets, which no other test here would notice.
    for (let at = 1; at < WHEEL.length - 1; at += 1) {
      const here = colourOf(WHEEL[at] as number);
      const next = colourOf(WHEEL[at + 1] as number);
      if (here === null || next === null) continue;
      expect(here).not.toBe(next);
    }
  });

  it("only ever lands in a pocket that exists", () => {
    for (let go = 0; go < 500; go += 1) {
      expect(WHEEL).toContain(spin());
    }
  });

  it("can be handed a source, so a test can say where the ball went", () => {
    expect(spin(() => 0)).toBe(0);
    expect(spin(() => 1)).toBe(32);
    expect(spin(() => 36)).toBe(26);
  });
});
