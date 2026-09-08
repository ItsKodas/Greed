/**
 * What a table can owe, and the stake cap that keeps it coverable.
 *
 * Blackjack pays the player from somewhere. Until this existed that somewhere
 * was nowhere: stakes were taken off the account and winnings handed back, so
 * a table where the players beat the dealer created chips and one where they
 * lost destroyed them. The house edge made it roughly balance over a long
 * enough run, which is not the same as never minting — and "roughly, eventually"
 * is exactly the argument this building does not accept about its money.
 *
 * So a bank, filled by the stakes of everybody who has played here, and a cap
 * derived from the worst hand the rules permit rather than from a percentile.
 * The same footing the machine stands on, and it has to be earned the same way.
 */

/**
 * The most hands one seat can end up playing.
 *
 * A pair splits once and a split hand cannot split again, which is what holds
 * this to two — and holds this whole file to arithmetic somebody can check.
 */
export const MAX_HANDS = 2;

/** What doubling multiplies a hand's bet by. */
export const DOUBLE = 2;

/** What a winning hand hands back, stake included. */
export const WIN_RETURN = 2;

/** What a dealt blackjack hands back: three to two, with the stake alongside. */
export const BLACKJACK_RETURN = 2.5;

/**
 * The candidate worst hands, in units of the opening bet.
 *
 * Two of them, and it is the second that binds — the same shape as the
 * machine's. Each is what the seat gets back and what it put up to get there,
 * because the bank only has to find the difference: every stake is in the bank
 * before the cards are settled.
 *
 *   dealt blackjack      back 2.5, staked 1   → the bank finds 1.5
 *   split, both doubled,
 *   both won             back 8,   staked 4   → the bank finds 4
 *
 * The second is worse despite the first paying the better rate, because
 * splitting and doubling put four times the bet on the felt to be paid at even
 * money — a rate below three to two, on a great deal more money.
 */
const WORST: ReadonlyArray<{ back: number; staked: number }> = [
  { back: BLACKJACK_RETURN, staked: 1 },
  { back: MAX_HANDS * DOUBLE * WIN_RETURN, staked: MAX_HANDS * DOUBLE },
];

/**
 * What the bank has to hold per chip of opening bet.
 *
 * Derived rather than chosen, and derived here rather than in a comment: the
 * numbers above come from the rules in table.ts, and a rule change that made
 * the game more generous has to move this with it.
 *
 * Four, on today's rules. Nothing like the machine's fourteen hundred, and for
 * a plain reason: a slot machine can pay nine lines at once and a share of its
 * own bank on top, where a blackjack seat can hold at most two hands.
 */
export const STAKE_DIVISOR = Math.ceil(
  Math.max(...WORST.map((hand) => hand.back - hand.staked)),
);

/**
 * The largest opening bet this bank can certainly pay out on.
 *
 * A cap rather than a refusal, deliberately, and for the same reason the
 * machine has one: a table that will not deal until its bank is fat is dark
 * exactly when it is newest, and every quiet week would close it again. A
 * table that offers smaller stakes instead is always playable, and playing it
 * is what fills the bank back up.
 */
export function maxStake(bank: number): number {
  return Math.max(0, Math.floor(Math.max(0, bank) / STAKE_DIVISOR));
}

/**
 * The most this bank could owe one seat that opened at this bet.
 *
 * It exists so the guarantee can be tested as a property across many banks
 * rather than asserted about one, and so the reasoning above is executable
 * instead of a comment somebody has to trust.
 *
 * Returned in the same terms as the rules: what goes back to the player, and
 * what the player put up along the way.
 */
export function worstCase(stake: number): { back: number; staked: number } {
  let worst = { back: 0, staked: 0 };
  for (const hand of WORST) {
    /*
     * Floored, because that is what the table does — `Math.floor(bet * 1.5)`
     * on a blackjack. Rounding up here would have the cap defend against a
     * payout larger than the game can actually make, which is safe but is not
     * the number this file claims to be.
     */
    const back = Math.floor(hand.back * stake);
    const staked = hand.staked * stake;
    if (back - staked > worst.back - worst.staked) {
      worst = { back, staked };
    }
  }
  return worst;
}
