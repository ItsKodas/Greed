import type { GameListing } from "@backroom/core";

/** How Roulette lists itself in the room. */
export const ROULETTE: GameListing = {
  id: "roulette",
  name: "Roulette",
  blurb: "One wheel, thirty-seven pockets, everybody at once.",
  shape: "table",
  /*
   * One seat is allowed for the same reason the machine's is: this table pays
   * from a bank that players alone fill, so a win still comes from real people
   * — everybody who has played here before you. What it is not allowed to do
   * is seat a bot at a table playing for chips, which the adapter refuses.
   */
  minSeats: 1,
  maxSeats: 8,
  mark: { text: "ROULETTE", accentAt: 4 },
  theme: { wall: "#150f14", felt: "#14402c", accent: "#c8342f", accentHi: "#ff6b63" },
  open: true,
};
