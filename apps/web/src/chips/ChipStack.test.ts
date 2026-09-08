import { describe, expect, it } from "vitest";
import { LADDER } from "./Chip.js";
import { columnsFor } from "./ChipColumns.js";
import { FACES } from "./Chip.js";
import { chipsFor, pileUp } from "./ChipStack.js";

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

/*
 * A ladder of somebody else's denominations.
 *
 * The tray's plates stop at a hundred, and a poker table's numbers are
 * multiples of ten. Counted in the tray's plates every blind on the felt comes
 * out as one odd chip standing for a remainder — which is a chip that means
 * "and some more" sitting where a twenty should be.
 */
describe("counting in a game's own chips", () => {
  const TABLE = [1000, 500, 250, 100, 50, 20, 10];

  it("makes a blind out of real plates rather than a remainder", () => {
    expect(chipsFor(10, TABLE)).toEqual([10]);
    expect(chipsFor(20, TABLE)).toEqual([20]);
    expect(chipsFor(80, TABLE)).toEqual([50, 20, 10]);
  });

  it("leaves nothing over for any amount a poker table can reach", () => {
    // Every multiple of the small blind, up to a full stack and beyond.
    for (let amount = 10; amount <= 6_000; amount += 10) {
      const chips = chipsFor(amount, TABLE);
      expect(chips.reduce((sum, chip) => sum + chip, 0)).toBe(amount);
      // Every chip is one the house actually has a face for.
      expect(chips.every((chip) => TABLE.includes(chip))).toBe(true);
    }
  });

  it("still counts in the tray's plates when nothing else is asked for", () => {
    expect(chipsFor(1750)).toEqual([1000, 500, 250]);
  });

  it("has a face for every plate on that ladder", () => {
    /*
     * The other half of the same fix. A denomination with no face is painted
     * in the house's plain clay, so a ten and a twenty would be the same grey
     * disc — which is a pile that cannot be read by colour, and reading a pile
     * by colour is the only reason to draw one.
     */
    for (const plate of TABLE) {
      expect(FACES[plate], `no face for ${plate}`).toBeDefined();
    }
    // And they are told apart, which is what the colour is for.
    expect(FACES[10]?.body).not.toBe(FACES[20]?.body);
  });
});

/*
 * How a heap of chips is arranged.
 *
 * Nobody builds one column of twenty: past about five it stops standing up and
 * stops being countable at a glance, which are the two things a stack is for.
 */
describe("arranging a heap", () => {
  it("leaves a small handful as one stack", () => {
    expect(pileUp([1000, 500, 250], 5)).toEqual([[1000, 500, 250]]);
  });

  it("goes sideways rather than up once a stack is full", () => {
    const heap = pileUp([1000, 1000, 1000, 500, 250, 100], 5);
    expect(heap).toHaveLength(2);
  });

  it("levels the stacks rather than leaving one chip beside a full one", () => {
    /*
     * Six into stacks of five is the case that gives it away: filling greedily
     * makes a stack of five and a stack of one, which reads as a mistake
     * rather than as money.
     */
    expect(pileUp([1, 2, 3, 4, 5, 6], 5).map((one) => one.length)).toEqual([3, 3]);
    expect(pileUp([1, 2, 3, 4, 5, 6, 7], 5).map((one) => one.length)).toEqual([4, 3]);
    expect(pileUp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 5).map((one) => one.length)).toEqual([
      4, 4, 3,
    ]);
  });

  it("never puts more in a stack than it was told to", () => {
    for (let count = 1; count <= 40; count += 1) {
      for (const tallest of [2, 3, 4, 5, 8]) {
        const chips = Array.from({ length: count }, (_, at) => at);
        const heap = pileUp(chips, tallest);
        expect(Math.max(...heap.map((one) => one.length))).toBeLessThanOrEqual(tallest);
        // And no chip is dropped or duplicated on the way in.
        expect(heap.flat()).toEqual(chips);
      }
    }
  });

  it("keeps the biggest plates together rather than mixing every stack", () => {
    // Sorted largest first on the way in, so a stack is of a kind — which is
    // both how people sort them and what makes a heap readable by colour.
    const heap = pileUp([1000, 1000, 1000, 100, 100, 100], 3);
    expect(heap[0]).toEqual([1000, 1000, 1000]);
    expect(heap[1]).toEqual([100, 100, 100]);
  });
});
