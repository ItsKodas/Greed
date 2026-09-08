import { describe, expect, it } from "vitest";
import { LADDER } from "./Chip.js";
import { columnsFor } from "./ChipColumns.js";
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
     * Nothing at this table can stake seventy — bets are built out of the
     * minted denominations — but a stack that quietly dropped it would be one
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

describe("counting a balance in the bigger plates", () => {
  it("uses the plates a wager cannot", () => {
    // The twenty-five is the one plate a wager cannot use, because a single
    // one of them would stake more than a table's ten-thousand maximum.
    expect(chipsFor(40_000, LADDER)).toEqual([25000, 5000, 5000, 5000]);
    // The same balance on the betting ladder, which tops out at five thousand.
    expect(chipsFor(40_000)).toHaveLength(8);
  });

  it("still adds up, on the long ladder as on the short one", () => {
    for (let amount = 0; amount <= 120_000; amount += 350) {
      const total = chipsFor(amount, LADDER).reduce((sum, chip) => sum + chip, 0);
      expect(total, `${amount} did not add up`).toBe(amount);
    }
  });
});

describe("racking a balance into columns", () => {
  it("groups by denomination", () => {
    expect(columnsFor(3000)).toEqual([{ value: 1000, count: 3 }]);
    expect(columnsFor(1600)).toEqual([
      { value: 1000, count: 1 },
      { value: 500, count: 1 },
      { value: 100, count: 1 },
    ]);
  });

  it("starts a new column rather than building a tower", () => {
    /*
     * A rack is a row of short columns because a tall one cannot be counted at
     * a glance — and because a column tall enough to hold a big balance would
     * not fit anywhere it needs to be drawn.
     */
    // Six of the largest plate, which is the only way to get past five of
    // anything once the big denominations are in play.
    const columns = columnsFor(150_000);
    expect(columns.every((column) => column.count <= 5)).toBe(true);
    expect(columns).toEqual([
      { value: 25000, count: 5 },
      { value: 25000, count: 1 },
    ]);
  });

  it("always racks the whole balance", () => {
    for (const amount of [0, 100, 2_750, 10_000, 43_650, 250_000]) {
      const total = columnsFor(amount).reduce(
        (sum, column) => sum + column.value * column.count,
        0,
      );
      expect(total, `${amount} was not fully racked`).toBe(amount);
    }
  });

  it("has nothing to rack for nothing", () => {
    expect(columnsFor(0)).toEqual([]);
  });
});
