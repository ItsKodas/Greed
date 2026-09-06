/**
 * Greed: six dice, bank it or lose it.
 *
 * The whole game in one package — its table, its scoring rules and its bot.
 * It borrows seating and the shape of a table from @backroom/core and brings
 * everything that makes it this game rather than another one.
 */
export { Room, RoomError } from "./room.js";
export type { Roller, Seat } from "./room.js";
export { decide, thinkingTime } from "./bot.js";
export { comboGateKeyFor } from "./gatekey.js";
export type { BotSkill, BotContext } from "./bot.js";
export { GREED } from "./listing.js";
export { greedAdapter } from "./adapter.js";
