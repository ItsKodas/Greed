import type { GameListing } from "@backroom/core";

/** How the tip jar lists itself in the room. */
export const TIPS: GameListing = {
  id: "tips",
  name: "The Tip Jar",
  blurb: "The bar drips, you tap, the chips are yours.",
  /*
   * One seat, and unlike the machine it does not need a bank to justify it.
   * Nothing is at risk here, so there is no win to come from anybody.
   */
  shape: "bar",
  minSeats: 1,
  maxSeats: 1,
  mark: { text: "TIP JAR", accentAt: 0 },
  theme: { wall: "#1a1410", felt: "#2b2018", accent: "#d99a3f", accentHi: "#ffcf7a" },
  open: true,
};
