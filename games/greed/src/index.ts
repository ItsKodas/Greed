import type { GameListing } from "@greed/core";

/**
 * Greed: six dice, bank it or lose it.
 *
 * The whole game in one package — its table, its scoring rules and its bot.
 * It borrows seating and the shape of a table from @greed/core and brings
 * everything that makes it this game rather than another one.
 */
export { Room, RoomError } from "./room.js";
export type { Roller, Seat } from "./room.js";
export { decide, thinkingTime } from "./bot.js";
export { comboGateKeyFor } from "./gatekey.js";
export type { BotSkill, BotContext } from "./bot.js";

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
