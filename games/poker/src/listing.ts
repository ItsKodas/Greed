import type { GameListing } from "@backroom/core";

/** How Poker lists itself in the room. */
export const POKER: GameListing = {
  id: "poker",
  name: "Poker",
  blurb: "Up to ten to a table, and the pot is everybody's chips.",
  shape: "table",
  /*
   * Two is a real game of poker — heads up — and ten is the building's own
   * ceiling. Twenty hole cards, five on the board and three burnt is
   * twenty-eight of fifty-two, so a full ring never runs the deck out.
   */
  minSeats: 2,
  maxSeats: 10,
  mark: { text: "POKER", accentAt: 0 },
  theme: { wall: "#141a17", felt: "#1c3a2c", accent: "#3f9d6a", accentHi: "#7fe0a8" },
  open: true,
};

/**
 * What a table can cost to sit down at, and what it plays for.
 *
 * The host picks one when they open it. Every level is a hundred big blinds to
 * sit down with, which is the shape of a small game everywhere — so choosing
 * what it costs to enter is the same act as choosing the stakes, and there is
 * only one number to pick rather than three that have to agree.
 *
 * A list rather than a range. A table is a decision about everybody's evening
 * and a room where every table is a different odd size is a room nobody can
 * read at a glance; four levels covers a ten thousand chip start from "a whole
 * evening" to "one sitting".
 */
export const STAKES = [1_000, 2_000, 5_000, 10_000] as const;

/** What a table costs to enter unless the host says otherwise. */
export const BUY_IN = 2_000;

/**
 * The blinds a given entry plays for.
 *
 * A hundred big blinds to the buy-in, and the small blind half of that. Every
 * level above divides into whole chips, which is checked rather than assumed.
 */
export function blindsFor(entry: number): { small: number; big: number } {
  return { small: Math.max(1, Math.round(entry / 200)), big: Math.max(2, Math.round(entry / 100)) };
}

/**
 * The nearest level to what was asked for.
 *
 * Snapped rather than clamped, and snapped here rather than trusted from the
 * payload: what a table costs is the one number in it that decides how much of
 * somebody's balance is at risk, and a client that could name its own would be
 * a client setting the stakes of a game other people sit down at.
 */
export function stakeFor(asked: unknown): number {
  const want = typeof asked === "number" && Number.isFinite(asked) ? asked : BUY_IN;
  let best: number = STAKES[0];
  for (const level of STAKES) {
    if (Math.abs(level - want) < Math.abs(best - want)) {
      best = level;
    }
  }
  return best;
}

/** The blinds at the default level, for anything that has not been told one. */
export const SMALL_BLIND = blindsFor(BUY_IN).small;
export const BIG_BLIND = blindsFor(BUY_IN).big;
