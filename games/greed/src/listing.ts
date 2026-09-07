import type { GameListing } from "@backroom/core";

/** How Greed lists itself in the room. */
export const GREED: GameListing = {
  id: "greed",
  name: "Greed",
  blurb: "Six dice. Bank it or lose it.",
  shape: "table",
  minSeats: 1,
  maxSeats: 10,
  mark: { text: "GREED", accentAt: 3 },
  theme: { wall: "#241811", felt: "#16241c", accent: "#c08a2e", accentHi: "#e8c168" },
  open: true,
};
