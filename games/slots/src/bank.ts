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
 *   one jackpot, eight top  0.4*bank + 8*875*stake/9
 *                           0.4*bank + 777.8*stake  <=  bank + stake
 *                                      776.8*stake  <=  0.6 * bank
 *                                             bank  >=  1294.6 * stake
 *
 * Rounded up to 1295, because a cap a fraction of a chip too generous is a cap
 * that does not hold. The stake sits on the right of both inequalities because
 * it has already entered the bank by the time the reels resolve.
 *
 * This is deliberately the true worst case rather than a percentile. All
 * fifteen cells landing on bells has a probability of about one in 10^15, and
 * capping against it is absurdly conservative in exactly the way a chip
 * economy should be.
 */
export const STAKE_DIVISOR = 1295;

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
  const withJackpot = jackpotPay(bank) + (LINE_COUNT - 1) * topLine;
  return Math.max(allFixed, withJackpot);
}
