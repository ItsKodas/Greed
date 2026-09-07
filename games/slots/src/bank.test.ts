import { describe, expect, it } from "vitest";
import { JACKPOT_SHARE, jackpotPay, maxStake, STAKE_DIVISOR, worstCase } from "./bank.js";

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
    expect(maxStake(50_000)).toBe(38);
    expect(maxStake(1_000_000)).toBe(772);
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
    for (const bank of [1295, 1296, 2000, 5000, 12_345, 50_000, 1_000_000, 50_000_000]) {
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

  it("is bound by the jackpot case rather than the all-fixed one", () => {
    /*
     * Worth pinning down, because this design got it wrong once. Nine top
     * lines needs a bank of 874x the stake. One jackpot line plus eight top
     * lines needs 1295x, because the jackpot is a share of the same bank the
     * fixed wins are drawing on — and it is the larger of the two that has to
     * set the cap.
     */
    expect(STAKE_DIVISOR).toBe(1295);
    const allFixed = 9 * Math.floor((875 * 1) / 9);
    expect(worstCase(1295, 1)).toBeGreaterThan(allFixed);
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
