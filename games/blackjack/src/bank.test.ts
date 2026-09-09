import { describe, expect, it } from "vitest";
import {
  BLACKJACK_RETURN,
  DOUBLE,
  MAX_HANDS,
  maxStake,
  maxStakeAgainst,
  roundWorstCase,
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

/*
 * The same arithmetic for a felt rather than a seat.
 *
 * `maxStake` answers about one hand, and a blackjack round settles every seat
 * at once. Six seats each holding the cap is six times the exposure the cap
 * was derived to cover, so the bank runs dry partway down the row and the last
 * winner is handed their stake back instead of their winnings. These say what
 * a round costs and what is left to offer the next seat to sit down.
 */
describe("the stake cap across a whole round", () => {
  it("charges a round for every seat in it", () => {
    const one = worstCase(1_000);
    const three = roundWorstCase([1_000, 1_000, 1_000]);
    expect(three.back - three.staked).toBe(3 * (one.back - one.staked));
  });

  it("costs nothing when nobody has bet", () => {
    expect(roundWorstCase([])).toEqual({ back: 0, staked: 0 });
  });

  it("offers a clear felt exactly what one seat could have", () => {
    // The old answer, which was never wrong — only incomplete.
    for (const bank of [0, 4_000, 12_345, 500_000]) {
      expect(maxStakeAgainst(bank, [])).toBe(maxStake(bank));
    }
  });

  it("offers nothing more once a round has committed the bank", () => {
    const bank = 4_000;
    // One seat at the cap is the whole of a bank this thin. The second seat is
    // told so rather than dealt in and short-paid.
    expect(maxStakeAgainst(bank, [maxStake(bank)])).toBe(0);
  });

  it("shrinks as seats sit down rather than growing with their stakes", () => {
    /*
     * The shape of the bug: every stake goes into the bank as it is placed, so
     * asking the bank what it holds partway through a betting window gives a
     * fatter answer each time somebody bets. What is left to offer has to fall.
     */
    const bank = 40_000;
    const offers = [
      maxStakeAgainst(bank, []),
      maxStakeAgainst(bank, [1_000]),
      maxStakeAgainst(bank, [1_000, 1_000]),
      maxStakeAgainst(bank, [1_000, 1_000, 1_000]),
    ];
    for (let at = 1; at < offers.length; at += 1) {
      expect(offers[at]).toBeLessThan(offers[at - 1] as number);
    }
  });

  it("never lets a whole felt outrun the bank it is paid from", () => {
    /*
     * The property the round budget exists for, and the one the per-seat cap
     * could not state: seat after seat takes whatever is still on offer, and
     * the worst hand every one of them could play is still payable.
     */
    for (const bank of [4, 5, 40, 4_000, 12_345, 500_000, 50_000_000]) {
      const stakes: number[] = [];
      // More seats than any blackjack table has, so the sweep runs past the
      // point where the bank has nothing left to offer.
      for (let seat = 0; seat < 12; seat += 1) {
        const stake = maxStakeAgainst(bank, stakes);
        if (stake < 1) {
          break;
        }
        stakes.push(stake);
      }
      const { back, staked } = roundWorstCase(stakes);
      expect(back).toBeLessThanOrEqual(bank + staked);
    }
  });

  it("holds when every seat takes the same stake rather than the most going", () => {
    // A felt does not fill politely from the top down: everybody bets the same
    // advertised number, and the last one to do it is the one who finds out.
    for (const bank of [4_000, 12_345, 500_000]) {
      const stakes: number[] = [];
      for (let seat = 0; seat < 8; seat += 1) {
        const stake = Math.min(maxStake(bank), maxStakeAgainst(bank, stakes));
        if (stake < 1) {
          break;
        }
        stakes.push(stake);
      }
      const { back, staked } = roundWorstCase(stakes);
      expect(back).toBeLessThanOrEqual(bank + staked);
    }
  });
});
