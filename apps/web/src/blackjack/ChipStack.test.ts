import { describe, expect, it } from "vitest";
import { chipsFor } from "./ChipStack.js";

describe("counting a wager out in chips", () => {
  it("uses the biggest chips first, the way anybody counts", () => {
    expect(chipsFor(1750)).toEqual([1000, 500, 250]);
    expect(chipsFor(2000)).toEqual([1000, 1000]);
    expect(chipsFor(100)).toEqual([100]);
  });

  it("always adds up to the wager", () => {
    // The one thing a stack must never do is disagree with the number beside
    // it, so this is checked across every amount the chips can make.
    for (let amount = 100; amount <= 10_000; amount += 50) {
      const total = chipsFor(amount).reduce((sum, chip) => sum + chip, 0);
      expect(total, `${amount} did not add up`).toBe(amount);
    }
  });

  it("keeps an odd remainder as a chip rather than losing it", () => {
    /*
     * Nothing at this table can stake seventy — bets are built out of the four
     * denominations — but a stack that quietly dropped it would be a stack
     * that disagreed with the figure printed next to it, which is the one
     * failure worth ruling out entirely.
     */
    expect(chipsFor(70)).toEqual([70]);
    expect(chipsFor(1070)).toEqual([1000, 70]);
  });

  it("has nothing to show for nothing", () => {
    expect(chipsFor(0)).toEqual([]);
    // Not a state anything produces, and not a reason to draw a chip either.
    expect(chipsFor(-500)).toEqual([]);
  });

  it("stacks the largest at the bottom", () => {
    const chips = chipsFor(1350);
    expect(chips).toEqual([1000, 250, 100]);
    // Descending, which is what makes it look like a stack somebody built
    // rather than a pile somebody dropped.
    for (let index = 1; index < chips.length; index += 1) {
      expect(chips[index] as number).toBeLessThanOrEqual(chips[index - 1] as number);
    }
  });
});
