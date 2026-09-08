/**
 * Who is owed what, when not everybody could cover the same bet.
 *
 * A pot is simple until somebody is all in for less than the others. Then the
 * chips split: everybody's money up to the short stack's level is a pot that
 * player can win, and everything above it is a pot they cannot. Two all-ins at
 * different levels make three pots, and so on.
 *
 * Kept apart from the table because it is arithmetic over a list of numbers
 * and nothing else — no cards, no turn order, no clock. Which means it can be
 * tested exhaustively, and it is: a table that pays out the wrong side pot is
 * a table that takes chips off somebody who won.
 */

export interface Contribution {
  /** Who put it in. */
  seatId: string;
  /** Everything they have put in this hand, across every street. */
  paid: number;
  /** False if they folded: their chips stay in, their claim does not. */
  contesting: boolean;
}

export interface Pot {
  /** Chips in this pot. */
  chips: number;
  /** The seats that can win it. */
  eligible: string[];
}

/**
 * The pots this hand has made, main first.
 *
 * Built from what everybody paid rather than tracked as the betting goes, so
 * it cannot drift: the only input is the total each player put in, which the
 * table knows for certain because it took every chip itself.
 *
 * Folded money is in the chips and out of the eligibility, which is exactly
 * what folding means — the chips stay on the table and the claim does not.
 */
export function pots(contributions: Contribution[]): Pot[] {
  const paid = new Map<string, number>();
  for (const one of contributions) {
    paid.set(one.seatId, (paid.get(one.seatId) ?? 0) + one.paid);
  }
  const contesting = new Set(
    contributions.filter((one) => one.contesting).map((one) => one.seatId),
  );

  /*
   * Every level somebody's money stops at, in order. Between one level and the
   * next, everybody still in has paid the same amount — which is the whole
   * definition of a pot.
   */
  const levels = [...new Set([...paid.values()].filter((amount) => amount > 0))].sort(
    (a, b) => a - b,
  );

  const out: Pot[] = [];
  let below = 0;
  for (const level of levels) {
    const band = level - below;
    let chips = 0;
    const eligible: string[] = [];
    for (const [seatId, amount] of paid) {
      if (amount <= below) {
        continue;
      }
      /*
       * The whole band, not a part of it.
       *
       * Every player's total is itself one of the levels, so anybody still
       * above `below` has necessarily reached the top of this band — there is
       * no such thing as a stack that stops halfway up one. This read
       * `Math.min(band, amount - below)` until a mutation showed the min could
       * never bind, which is worse than redundant: it implies a case exists.
       */
      chips += band;
      if (contesting.has(seatId) && amount >= level) {
        eligible.push(seatId);
      }
    }
    if (chips > 0) {
      out.push({ chips, eligible });
    }
    below = level;
  }

  /*
   * Adjacent bands with the same claimants are one pot.
   *
   * A level only matters if it changes who can win what is above it. When it
   * does not, splitting there describes the same money twice — most visibly on
   * an uncalled bet, where the overspill is one player's own chips with nobody
   * contesting them and would otherwise sit in a pot of its own that only they
   * could win. Merging keeps this a list of pots a player would recognise:
   * a main pot, and a side pot for each stack that could not reach the top.
   */
  const merged: Pot[] = [];
  for (const pot of out) {
    const last = merged[merged.length - 1];
    const same =
      last !== undefined &&
      last.eligible.length === pot.eligible.length &&
      last.eligible.every((seatId) => pot.eligible.includes(seatId));
    if (last !== undefined && (pot.eligible.length === 0 || same)) {
      last.chips += pot.chips;
      continue;
    }
    merged.push(pot);
  }
  return merged;
}

/**
 * Splitting one pot between the players who tied for it.
 *
 * Chips are whole, so a pot that does not divide evenly has an odd chip or
 * two. They go to the earliest seats in the order given, which the table hands
 * in as seat order from the dealer's left — the same rule a card room uses,
 * and a fixed one, because "somebody gets the odd chip" has to be answerable
 * the same way every time.
 */
export function split(chips: number, winners: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (winners.length === 0) {
    return out;
  }
  const each = Math.floor(chips / winners.length);
  let odd = chips - each * winners.length;
  for (const winner of winners) {
    out.set(winner, each + (odd > 0 ? 1 : 0));
    if (odd > 0) {
      odd -= 1;
    }
  }
  return out;
}
