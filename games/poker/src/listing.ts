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
 * The stakes, fixed for now.
 *
 * Ten and twenty with a hundred big blinds to sit down with, which is the
 * shape of a small game everywhere. Deliberately small against a ten thousand
 * chip start: a table that took a player's whole balance to sit at is a table
 * they can only afford to sit at once.
 */
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const BUY_IN = BIG_BLIND * 100;
