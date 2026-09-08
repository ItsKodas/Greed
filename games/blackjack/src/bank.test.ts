import { describe, expect, it } from "vitest";
import {
  BLACKJACK_RETURN,
  DOUBLE,
  MAX_HANDS,
  maxStake,
  STAKE_DIVISOR,
  WIN_RETURN,
  worstCase,
} from "./bank.js";

/**
 * The property this table has to rest on to be allowed to pay a lone player.
 *
 * Everything else in this package is a card game. This is what makes it one
 * the building can run against the dealer: it cannot pay out more than players
 * have put in, and the cap that guarantees it comes from the worst hand the
 * rules permit rather than from a percentile somebody felt was safe enough.
 */
describe("the stake cap", () => {
  it("offers nothing from an empty bank", () => {
    expect(maxStake(0)).toBe(0);
  });

  it("never offers a stake on a negative bank", () => {
    // Unreachable if everything else holds, which is exactly why it is worth
    // being sure of: a negative bank must not read as a large allowance.
    expect(maxStake(-1)).toBe(0);
    expect(maxStake(-999_999)).toBe(0);
  });

  it("rises as the bank fills", () => {
    expect(maxStake(1_000)).toBe(Math.floor(1_000 / STAKE_DIVISOR));
    expect(maxStake(1_000_000)).toBeGreaterThan(maxStake(1_000));
    expect(maxStake(1_000)).toBeGreaterThan(0);
  });

  it("never lets the worst hand outrun the bank it is paid from", () => {
    /*
     * The whole point. Every stake is in the bank before the cards settle, so
     * what the bank has to find is the payout less what went in to earn it.
     */
    for (const bank of [4, 5, 40, 1_000, 12_345, 500_000, 50_000_000]) {
      const stake = maxStake(bank);
      if (stake < 1) {
        continue;
      }
      const { back, staked } = worstCase(stake);
      expect(back).toBeLessThanOrEqual(bank + staked);
    }
  });

  it("holds for every stake the cap permits, not only the largest", () => {
    const bank = 4_000;
    for (let stake = 1; stake <= maxStake(bank); stake += 1) {
      const { back, staked } = worstCase(stake);
      expect(back).toBeLessThanOrEqual(bank + staked);
    }
  });

  it("holds across a long sweep of banks", () => {
    for (let bank = STAKE_DIVISOR; bank < 200_000; bank += 331) {
      const stake = maxStake(bank);
      const { back, staked } = worstCase(stake);
      expect(back).toBeLessThanOrEqual(bank + staked);
    }
  });

  it("is bound by the split hand rather than the blackjack", () => {
    /*
     * Worth pinning, because the blackjack pays the better rate and is the
     * obvious candidate. It is not the worst: splitting and doubling puts four
     * times the bet on the felt to be paid at even money, which is a worse
     * rate on a great deal more money.
     */
    const stake = 1_000;
    const split = MAX_HANDS * DOUBLE * WIN_RETURN * stake - MAX_HANDS * DOUBLE * stake;
    const dealt = Math.floor(BLACKJACK_RETURN * stake) - stake;
    expect(split).toBeGreaterThan(dealt);

    const { back, staked } = worstCase(stake);
    expect(back - staked).toBe(split);
  });

  it("comes out of the rules rather than being typed in", () => {
    /*
     * Summed again here from the constants, so a rule change that made the
     * game more generous — a third split, a bigger double — fails this test
     * until the cap has been moved to match.
     */
    const fromRules = Math.ceil(
      Math.max(BLACKJACK_RETURN - 1, MAX_HANDS * DOUBLE * WIN_RETURN - MAX_HANDS * DOUBLE),
    );
    expect(STAKE_DIVISOR).toBe(fromRules);
  });

  it("is far kinder than the machine's, and for a reason worth stating", () => {
    /*
     * A slot machine pays nine lines at once and a share of its own bank on
     * top; a blackjack seat holds two hands. If this ever crept up towards the
     * machine's, something has been added to the game that this file has not
     * been told about.
     */
    expect(STAKE_DIVISOR).toBeLessThan(20);
    expect(STAKE_DIVISOR).toBeGreaterThan(1);
  });

  it("pays whole chips only", () => {
    // The table floors a blackjack's three-to-two, so this must too, or the
    // cap defends against a payout the game cannot actually make.
    for (const stake of [1, 3, 7, 99, 1_001]) {
      const { back } = worstCase(stake);
      expect(Number.isInteger(back)).toBe(true);
    }
  });
});

/*
 * The rules this file is arithmetic about.
 *
 * bank.ts cannot see table.ts, so a rule loosened over there — a third split,
 * a double that trebles — would leave the cap defending against a hand the
 * game no longer plays, and defending too little. These pin the two together
 * from this end: the numbers above are claims about the table, and a claim
 * about code somebody else can change belongs in a test rather than a comment.
 */
describe("the rules the cap is derived from", () => {
  it("holds a seat to two hands", () => {
    // split.test.ts proves the table refuses a re-split. This says what that
    // refusal is worth: it is the whole reason the cap is four rather than
    // eight, and it is the number MAX_HANDS stands for.
    expect(MAX_HANDS).toBe(2);
  });

  it("pays a win at even money and a dealt blackjack at three to two", () => {
    expect(WIN_RETURN).toBe(2);
    expect(BLACKJACK_RETURN).toBe(2.5);
  });

  it("doubles a bet rather than multiplying it further", () => {
    expect(DOUBLE).toBe(2);
  });
});
