import { describe, expect, it } from "vitest";
import {
  FREE_STAKE_DIVISOR,
  JACKPOT_SHARE,
  jackpotPay,
  MAX_LINE_PAY,
  maxFreeStake,
  maxStake,
  STAKE_DIVISOR,
  worstCase,
} from "./bank.js";
import { LINE_COUNT } from "./paylines.js";

/**
 * The property this whole game rests on.
 *
 * Everything else in this package is a slot machine. This is what makes it one
 * the building is allowed to run: it cannot pay out more than players put in,
 * and the cap that guarantees it is derived from the worst spin possible
 * rather than from a percentile somebody felt was safe enough.
 */
describe("the stake cap", () => {
  it("offers nothing at all from an empty bank", () => {
    // Which is why the machine cannot open itself, and an admin has to float
    // it before anybody can play.
    expect(maxStake(0)).toBe(0);
  });

  it("offers one chip at the smallest bank that can cover one", () => {
    expect(maxStake(STAKE_DIVISOR)).toBe(1);
    expect(maxStake(STAKE_DIVISOR - 1)).toBe(0);
  });

  it("rises as the bank fills", () => {
    expect(maxStake(50_000)).toBe(Math.floor(50_000 / STAKE_DIVISOR));
    expect(maxStake(1_000_000)).toBe(Math.floor(1_000_000 / STAKE_DIVISOR));
    // Both non-trivial, so this cannot pass by everything being zero.
    expect(maxStake(1_000_000)).toBeGreaterThan(maxStake(50_000));
    expect(maxStake(50_000)).toBeGreaterThan(0);
  });

  it("never offers a stake on a negative bank", () => {
    // Unreachable if everything else holds, which is exactly why it is worth
    // being sure of: a negative bank must not read as a large allowance.
    expect(maxStake(-1)).toBe(0);
    expect(maxStake(-999_999)).toBe(0);
  });

  it("never lets the worst possible spin outrun the bank", () => {
    /*
     * The guarantee, over a wide spread of banks rather than one example.
     *
     * The room is the bank plus the stake, because the stake has already gone
     * in by the time the reels resolve. If this ever fails the machine can owe
     * chips that do not exist, which is the one thing it must never do.
     */
    for (const bank of [1296, 1297, 2000, 5000, 12_345, 50_000, 1_000_000, 50_000_000]) {
      const stake = maxStake(bank);
      if (stake < 1) {
        continue;
      }
      expect(worstCase(bank, stake)).toBeLessThanOrEqual(bank + stake);
    }
  });

  it("holds for every stake the cap permits, not only the largest", () => {
    const bank = 50_000;
    for (let stake = 1; stake <= maxStake(bank); stake += 1) {
      expect(worstCase(bank, stake)).toBeLessThanOrEqual(bank + stake);
    }
  });

  it("holds across a long sweep of banks", () => {
    // Every bank from just-playable up to a large one, at its largest stake.
    for (let bank = STAKE_DIVISOR; bank < 400_000; bank += 997) {
      const stake = maxStake(bank);
      expect(worstCase(bank, stake)).toBeLessThanOrEqual(bank + stake);
    }
  });

  it("holds at the large stakes where a rounding error would first show", () => {
    /*
     * Where 1295 was wrong. The jackpot's share is of the bank *after* the
     * stake goes in, and at a stake of one that extra 0.4 of a chip vanishes
     * into the floor. It stops vanishing once the stake is in the thousands:
     * a divisor of 1295 leaves this machine owing 176 chips it has not got.
     */
    for (const stake of [500, 1000, 5000, 40_000]) {
      const bank = stake * STAKE_DIVISOR;
      expect(worstCase(bank, stake)).toBeLessThanOrEqual(bank + stake);
    }
  });

  it("is bound by the jackpot case rather than the all-fixed one", () => {
    /*
     * Worth pinning down, because this design got it wrong once. Nine top
     * lines needs a bank of 874x the stake. One jackpot line plus eight top
     * lines needs 1296x, because the jackpot is a share of the same bank the
     * fixed wins are drawing on — and it is the larger of the two that has to
     * set the cap.
     */
    const allFixed = LINE_COUNT * Math.floor(MAX_LINE_PAY / LINE_COUNT);
    expect(STAKE_DIVISOR).toBeGreaterThan(allFixed);
    expect(worstCase(STAKE_DIVISOR, 1)).toBeGreaterThan(allFixed);
    // Derived from the paytable rather than typed in, so a retune moves it.
    expect(STAKE_DIVISOR).toBe(Math.ceil(((8 * MAX_LINE_PAY) / 9 / 0.6) as number) - 1);
  });

  /*
   * A free spin takes nothing, so the stake is missing from both sides of the
   * jackpot case and the bank has to be one stake deeper to cover the same
   * worst spin. One chip in thirteen hundred, and the difference between a
   * promise that holds and one that nearly does.
   */
  it("asks a little more of the bank for a spin nobody paid for", () => {
    expect(FREE_STAKE_DIVISOR).toBe(STAKE_DIVISOR + 1);
    for (const bank of [FREE_STAKE_DIVISOR, 50_000, 1_000_000, 50_000_000]) {
      expect(maxFreeStake(bank)).toBeLessThanOrEqual(maxStake(bank));
    }
  });

  it("never lets a free spin outrun the bank it is paid from", () => {
    /*
     * The paid case has the stake to spend as well as the bank; this one has
     * only the bank. Same worst spin, one fewer stake to cover it with — so
     * this asserts against `bank` where the paid sweep asserts against
     * `bank + stake`.
     */
    for (let bank = FREE_STAKE_DIVISOR; bank < 400_000; bank += 997) {
      const stake = maxFreeStake(bank);
      if (stake < 1) {
        continue;
      }
      expect(worstCase(bank, stake) - stake).toBeLessThanOrEqual(bank);
    }
  });

  it("walks a whole run of free spins down without ever going short", () => {
    /*
     * The reason the cap is re-read before every free spin rather than once
     * when they were awarded. Twenty free spins each paying the worst the
     * machine can pay: the bank shrinks under them, and the cap has to shrink
     * with it.
     */
    let bank = 4_000_000;
    for (let spin = 0; spin < 20; spin += 1) {
      const stake = maxFreeStake(bank);
      if (stake < 1) {
        break;
      }
      const owed = worstCase(bank, stake) - stake;
      expect(owed).toBeLessThanOrEqual(bank);
      bank -= owed;
      expect(bank).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the jackpot", () => {
  it("pays a share of whatever is actually in the bank", () => {
    expect(jackpotPay(100_000)).toBe(40_000);
    expect(JACKPOT_SHARE).toBe(0.4);
  });

  it("is never more than the bank holds, however thin the bank", () => {
    for (const bank of [0, 1, 7, 999, 123_456]) {
      expect(jackpotPay(bank)).toBeLessThanOrEqual(bank);
    }
  });

  it("pays nothing rather than something negative from an empty bank", () => {
    expect(jackpotPay(0)).toBe(0);
    expect(jackpotPay(-500)).toBe(0);
  });

  it("pays whole chips only", () => {
    expect(Number.isInteger(jackpotPay(12_345))).toBe(true);
    expect(Number.isInteger(jackpotPay(7))).toBe(true);
  });
});
