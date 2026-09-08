/**
 * Chips moving from one player to another.
 *
 * This is the first thing in the building that moves chips without a game
 * having been played, so it is worth being explicit about what it is and is
 * not. It does not mint: a transfer is a debit and a credit of the same
 * number, and the total in circulation is the same afterwards. Nothing here
 * takes payment, and adding one would be the wrong change — that rule is
 * untouched.
 *
 * What it does do is make chips portable, and two consequences follow that the
 * rest of this file exists to blunt:
 *
 * - **The daily top-up becomes a faucet worth farming.** An account collects
 *   5,000 chips every twenty hours whether it plays or not. One account doing
 *   that is the point of the daily; fifty accounts pouring into one is a chip
 *   printer with a person standing next to it. Hence a cap on how fast any one
 *   account can pour, and a record of every pour.
 * - **Chips become sellable off the premises.** Nothing in this building can
 *   stop somebody agreeing a price elsewhere and settling it here. What it can
 *   do is refuse to be quiet about it: every transfer is written down with who,
 *   to whom, how much and when, so the question "where did these chips come
 *   from" keeps the answer it has always had.
 */

/** One transfer, as it is written down. Never deleted, only read. */
export interface Transfer {
  id: string;
  fromId: string;
  /**
   * The names at the time, kept beside the ids rather than looked up later.
   *
   * A Discord display name changes whenever its owner likes, and a ledger that
   * resolved names on read would quietly rewrite its own history every time
   * somebody renamed themselves. What it says is what was true when it
   * happened.
   */
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  at: number;
}

/** The window a sending allowance is measured over. */
export const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The most one account may send in a day.
 *
 * Five times the daily top-up, which is the number it is set against: a farm
 * of alt accounts can still pour, but each one pours at a rate somebody has
 * chosen rather than at the speed of a script. It is deliberately far above
 * anything a person gifting a friend runs into and deliberately far below
 * "unlimited", because those are the two failure modes and there is a lot of
 * room between them.
 */
export const DAILY_SEND_CAP = 25_000;

/** The least that can be sent. A transfer of nothing is not a transfer. */
export const MIN_SEND = 1;

export type SendFailure =
  | "bad-amount"
  | "no-recipient"
  | "to-yourself"
  | "not-enough"
  | "over-cap";

/** Why a transfer was refused, in the words the sender sees. */
export const SEND_REFUSALS: Record<SendFailure, string> = {
  "bad-amount": "That is not an amount of chips.",
  "no-recipient": "No such player.",
  "to-yourself": "You already have those.",
  "not-enough": "You do not have that many.",
  "over-cap": "That is more than you can send today.",
};

export type SendResult =
  | {
      ok: true;
      /** What the sender holds now. */
      balance: number;
      amount: number;
      /** What is left of today's allowance, after this. */
      leftToday: number;
      to: { id: string; name: string };
    }
  | { ok: false; reason: SendFailure; leftToday: number };

/**
 * Whether a transfer may go ahead, given what the sender has and has sent.
 *
 * Pure, and shared by both stores, so the rule cannot drift between running
 * with a database and running without one — the same reason `judgeDaily` is
 * written this way. It decides nothing about whether the recipient exists;
 * that is a question for whoever can look one up.
 */
export function judgeSend(input: {
  amount: number;
  balance: number;
  /** Already sent inside the window. */
  sentToday: number;
}): { ok: true } | { ok: false; reason: SendFailure } {
  const left = Math.max(0, DAILY_SEND_CAP - input.sentToday);
  if (!Number.isInteger(input.amount) || input.amount < MIN_SEND) {
    return { ok: false, reason: "bad-amount" };
  }
  /*
   * Affordability before the cap. Both refusals are true of somebody sending
   * more than they have and more than they may, and "you do not have that
   * many" is the one they can do something about.
   */
  if (input.amount > input.balance) {
    return { ok: false, reason: "not-enough" };
  }
  if (input.amount > left) {
    return { ok: false, reason: "over-cap" };
  }
  return { ok: true };
}

/** What is left of an account's allowance, given what it has already sent. */
export function leftToSend(sentToday: number): number {
  return Math.max(0, DAILY_SEND_CAP - sentToday);
}
