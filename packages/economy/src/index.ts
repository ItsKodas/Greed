/**
 * Chips, profiles and history — everything about a player that outlives the
 * table they were sitting at.
 *
 * Nothing in here knows what game is being played. A balance is a balance
 * whether it was won on dice or on cards, which is the whole reason it lives
 * apart from the games rather than inside one of them.
 */
export {
  DAILY_FLOOR,
  DAILY_GRANT,
  DAILY_INTERVAL_MS,
  MemoryStore,
  STARTING_CHIPS,
  emptyStats,
  judgeDaily,
} from "./store.js";
export type { DailyResult, GameRecord, Profile, ProfileStats, StatBump, Store } from "./store.js";
export { MongoStore } from "./mongo-store.js";
export { CODE_ALPHABET, CODE_LENGTH, judgeCode, mintCodeText, normaliseCode } from "./codes.js";
export type { CodeRecord, RedeemFailure, RedeemResult } from "./codes.js";
