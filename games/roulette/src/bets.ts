import type { Bet } from "./bank.js";
import { hits, pays, spotAt } from "./spots.js";

/**
 * Chips on the cloth, and what the wheel does to them.
 *
 * A placed bet names a spot by id rather than carrying its own set of numbers.
 * That is the whole safety property of this file: a client says "put fifty on
 * corner:1-2-4-5", and a message naming numbers nobody can bet on has nothing
 * to look up and so buys nothing.
 */

/** One player's chips, on one spot. */
export interface Placed {
  readonly seatId: string;
  readonly spotId: string;
  readonly chips: number;
}

/** What one seat got out of a spin. */
export interface Paid {
  /** Handed back, stake included. Zero is a bet that lost. */
  back: number;
  /** What that seat had on the cloth, win or lose. */
  staked: number;
  /** Which of their bets came in, for a felt that wants to point at them. */
  won: { spotId: string; back: number }[];
}

/**
 * What the bank reasons about: the same chips, with their spots resolved.
 *
 * Anything naming a spot that does not exist is dropped here rather than
 * defended against everywhere downstream. The table refuses those on the way
 * in; this is the second lock on the same door.
 */
export function toBets(placed: readonly Placed[]): Bet[] {
  const out: Bet[] = [];
  for (const one of placed) {
    const spot = spotAt(one.spotId);
    if (spot !== null) out.push({ spot, chips: one.chips });
  }
  return out;
}

/**
 * What every seat gets back, now the ball has landed.
 *
 * A losing bet returns nothing at all rather than a negative: the stake went
 * into the bank when the chip went down, so losing is simply not being paid.
 * Keeping it that way is what makes the sum of everything returned comparable
 * against what the bank promised.
 */
export function settle(placed: readonly Placed[], pocket: number): Map<string, Paid> {
  const out = new Map<string, Paid>();
  for (const one of placed) {
    const seat = out.get(one.seatId) ?? { back: 0, staked: 0, won: [] };
    const spot = spotAt(one.spotId);
    if (spot !== null) {
      seat.staked += one.chips;
      if (hits(spot, pocket)) {
        const back = one.chips * (pays(spot) + 1);
        seat.back += back;
        seat.won.push({ spotId: one.spotId, back });
      }
    }
    out.set(one.seatId, seat);
  }
  return out;
}
