import type { GameListing } from "@greed/core";

/** How blackjack lists itself in the room. */
export const BLACKJACK: GameListing = {
  id: "blackjack",
  name: "Blackjack",
  blurb: "Beat the dealer to twenty-one.",
  shape: "table",
  minSeats: 1,
  maxSeats: 6,
  open: true,
};
