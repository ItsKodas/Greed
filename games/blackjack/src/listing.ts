import type { GameListing } from "@backroom/core";

/** How blackjack lists itself in the room. */
export const BLACKJACK: GameListing = {
  id: "blackjack",
  name: "Blackjack",
  blurb: "Beat the dealer to twenty-one.",
  shape: "table",
  minSeats: 1,
  maxSeats: 10,
  // No mark: the name is written plainly, and the room keeps the sign's blue.
  theme: { wall: "#0b1712", felt: "#17402e", accent: "#2e7bff", accentHi: "#7ba9ff" },
  open: true,
};
