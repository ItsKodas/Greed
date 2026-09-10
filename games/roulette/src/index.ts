/**
 * Roulette: one wheel, thirty-seven pockets, everybody at once.
 *
 * The third game to pay from a bank, and the first where a single result
 * settles every player at the table — which is why its bank works the whole
 * cloth out exactly rather than capping each seat on its own.
 */

export type { Bank } from "./adapter.js";
export { rouletteAdapter } from "./adapter.js";
export {
  type Bet,
  CHIPS,
  FUN_BANK,
  FUN_PURSE,
  headroom,
  MIN_CHIP,
  needed,
  owed,
  STAKE_DIVISOR,
  staked,
} from "./bank.js";
export { botBet, thinkingTime } from "./bot.js";
export type { Paid, Placed } from "./bets.js";
export { settle, toBets } from "./bets.js";
export { ROULETTE } from "./listing.js";
export type { Kind, Spot } from "./spots.js";
export { hits, kindsOf, pays, SPOTS, spotAt } from "./spots.js";
export type { Phase, SeatView, TableView, Win } from "./table.js";
export { HISTORY, LAST_CALL_MS, SETTLE_MS, SPIN_MS, Table, WINDOWS, WINNERS } from "./table.js";
export type { Colour } from "./wheel.js";
export { BLACK, colourOf, POCKETS, RED, spin, WHEEL } from "./wheel.js";
