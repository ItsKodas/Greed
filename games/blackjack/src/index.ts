/**
 * Blackjack: beat the dealer to twenty-one.
 *
 * The second game, and the one that put the shared parts to the test — it has
 * hidden information, a stake per hand and no score, none of which Greed has.
 */
import type { GameListing } from "@greed/core";

export { Shoe, freshDeck, shuffle, DECKS, RANKS, SUITS } from "./cards.js";
export type { Card, Rank, Suit } from "./cards.js";
export { isBlackjack, value } from "./hand.js";
export type { HandValue } from "./hand.js";
export { Table } from "./table.js";
export type { Outcome, Phase, Seat, SeatView, TableView } from "./table.js";

/** How blackjack lists itself in the room. */
export const BLACKJACK: GameListing = {
  id: "blackjack",
  name: "Blackjack",
  blurb: "Beat the dealer to twenty-one.",
  shape: "table",
  minSeats: 1,
  maxSeats: 6,
  /*
   * Shut until the socket layer can carry it. The engine below is finished and
   * tested; what is missing is the server, which still speaks Greed's verbs.
   * Listing it as open before then would be a lie told in the room.
   */
  open: false,
};
