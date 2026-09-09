import { MAX } from "./ladder.js";

/**
 * The most this jar could honestly have paid by now, and the last line of
 * defence.
 *
 * The level arithmetic already bounds the payout: chips cannot leave a jar
 * faster than they drip into it. This does not trust that. A guard derived
 * from what the game is *supposed* to allow is a guard that agrees with the
 * bug, so this one is derived from the fastest the game could conceivably pay
 * — every upgrade bought, brim-full at the turnover — and it holds even if the
 * level arithmetic is wrong.
 *
 * `MAX.brim` is the constant term because a level carried in from the night
 * before is real money the player earned, and refusing to pay it would be the
 * guard stealing rather than protecting.
 */
export function guardCeiling(nightStartedAt: number, now: number): number {
  const elapsed = Math.max(0, now - nightStartedAt);
  return MAX.brim + (MAX.trickle * elapsed) / 60_000;
}

export function withinGuard(
  paidThisNight: number,
  pay: number,
  nightStartedAt: number,
  now: number,
): boolean {
  return paidThisNight + pay <= guardCeiling(nightStartedAt, now);
}
