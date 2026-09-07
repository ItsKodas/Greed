import type { GameListing } from "@backroom/core";

/** How Slots lists itself in the room. */
export const SLOTS: GameListing = {
  id: "slots",
  name: "Slots",
  blurb: "Five reels, nine lines, one climbing bank.",
  shape: "machine",
  /*
   * One seat, which every other game in the building would refuse. What makes
   * it allowable here is the bank: it holds only what players staked, so a win
   * still comes from real people — everybody who played before you.
   */
  minSeats: 1,
  maxSeats: 1,
  mark: { text: "SLOTS", accentAt: 2 },
  theme: { wall: "#1b1220", felt: "#2a1836", accent: "#c9439e", accentHi: "#ff86d4" },
  open: true,
};
