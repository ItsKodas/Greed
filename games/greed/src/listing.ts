import type { GameListing } from "@backroom/core";

/** How Greed lists itself in the room. */
export const GREED: GameListing = {
  id: "greed",
  name: "Greed",
  blurb: "Six dice. Bank it or lose it.",
  shape: "table",
  minSeats: 1,
  maxSeats: 8,
  open: true,
};
