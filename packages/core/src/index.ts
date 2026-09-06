/**
 * What every table has in common, whatever is being played at it.
 *
 * Nothing in here knows about dice, cards or reels. A game brings its own
 * rules and its own state and borrows the rest: who is sitting down, who is
 * host, who dropped out, who is only watching.
 */
export { MAX_NAME, MAX_SEATS, MIN_SEATS, TableError } from "./types.js";
export type { BotSkill, Seat, SeatIdentity, TableStatus } from "./types.js";
export { Seating } from "./seating.js";
