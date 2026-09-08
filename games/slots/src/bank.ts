import { LINE_COUNT } from "./paylines.js";
import { PAYS } from "./paytable.js";

/** What a jackpot takes out of the bank. */
export const JACKPOT_SHARE = 0.4;

/** The largest fixed win on one line: five bells. */
export const MAX_LINE_PAY = PAYS.bell[5] as number;

/**
 * What the bank has to hold per chip staked.
 *
 * Derived rather than chosen. There are two candidate worst spins, and it is
 * the second that binds:
 *
 *   nine top lines          9 * 875 * stake/9  =  875 * stake
 *                           needs bank >= 874 * stake
 *
 *   one jackpot, eight top  0.4*(bank + stake) + 8*875*stake/9
 *                           0.4*bank + 0.4*stake + 777.8*stake <= bank + stake
 *                                                777.2*stake  <=  0.6 * bank
 *                                                       bank  >=  1295.3 * stake
 *
 * Rounded up to 1296, because a cap a fraction of a chip too generous is a cap
 * that does not hold.
 *
 * The stake appears on both sides of that second line, and getting it onto
 * only one is how this was wrong the first time. The stake enters the bank
 * before the reels resolve, so it is part of the room a payout has — and it is
 * also part of the bank the jackpot takes its share of. Taking the share of
 * the bank as it stood before the pull makes 1295 look sufficient, and it is
 * not: at a stake of 1000 that machine owes 176 chips it does not have.
 *
 * This is deliberately the true worst case rather than a percentile. All
 * fifteen cells landing on bells has a probability of about one in 10^15, and
 * capping against it is absurdly conservative in exactly the way a chip
 * economy should be.
 */
export const STAKE_DIVISOR = 1296;

/**
 * The largest stake this bank can certainly pay out on.
 *
 * A cap rather than a refusal, deliberately. A machine that will not spin
 * until its bank is fat is dark exactly when it is newest, and every quiet
 * week would close it again. A machine that offers smaller stakes instead is
 * always playable, and playing it is what fills the bank back up.
 */
export function maxStake(bank: number): number {
  return Math.max(0, Math.floor(Math.max(0, bank) / STAKE_DIVISOR));
}

/** What a jackpot pays out of this bank: whole chips, never more than it holds. */
export function jackpotPay(bank: number): number {
  return Math.floor(Math.max(0, bank) * JACKPOT_SHARE);
}

/**
 * The most this bank could possibly owe on one spin at this stake.
 *
 * Both cases, whichever is worse. It exists so the guarantee can be tested as
 * a property across many banks rather than asserted about one, and so that the
 * reasoning behind STAKE_DIVISOR is executable instead of a comment somebody
 * has to trust.
 */
export function worstCase(bank: number, stake: number): number {
  const topLine = Math.floor((MAX_LINE_PAY * stake) / LINE_COUNT);
  const allFixed = LINE_COUNT * topLine;
  /*
   * The jackpot's share is of the bank the payout is actually made from, which
   * is the bank plus the stake that has just gone into it. Modelling it as a
   * share of the bank beforehand is what made 1295 look like enough.
   */
  const withJackpot = jackpotPay(bank + stake) + (LINE_COUNT - 1) * topLine;
  return Math.max(allFixed, withJackpot);
}

/**
 * What a machine playing for nothing starts with.
 *
 * A for-fun machine keeps its own purse *and* its own bank, both living at the
 * machine and gone when the player walks away. That is what lets every other
 * number in this package stay exactly as it is: the same paytable, the same
 * cap, the same share of the bank — run against figures that were never
 * anybody's.
 *
 * The bank is seeded past 1296 x the largest chip on the tray, so the whole
 * tray is playable from the first pull rather than greying out until an
 * imaginary bank has filled.
 */
export const FUN_PURSE = 25_000;
export const FUN_BANK = 8_000_000;

/**
 * The chips this machine takes, largest first.
 *
 * The same denominations the card tables mint, because they are the same
 * chips: a player who has learned that purple is five hundred should not have
 * to learn it again twenty feet away. The artwork lives with the chips in the
 * client; what belongs here is which of them this game accepts.
 *
 * Every one of these needs a bank of 1296 times it before the machine will
 * take it, so the tray fills up as the bank does rather than all at once.
 *
 * The fifty is the machine's own, below anything the card tables take: a
 * spin is a smaller thing than a hand, and nine lines at fifty is already
 * four hundred and fifty on the felt.
 */
export const CHIPS = [5000, 1000, 500, 250, 100, 50] as const;

/** The smallest thing anybody can put in. */
export const MIN_STAKE = CHIPS[CHIPS.length - 1];
