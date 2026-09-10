/**
 * Death rolling: two people, and a number that only goes down.
 *
 * Only the listing so far — the arithmetic and the duel are worth reading on
 * their own for now, and gain their exports here once a table sits on top of
 * them. Without this, `@backroom/game-death-roll` has nothing a package.json
 * "main" of `./src/index.ts` can resolve, and the catalogue cannot tell this
 * game's real listing from its placeholder in COMING.
 */
export {
  ANTE,
  CEILINGS,
  DEAL_MS,
  DEATH_ROLL,
  FUN_PURSE,
  OPENING,
  PASS_DIVISOR,
  RESULT_MS,
  STAKES,
  TURN_MS,
  anteFor,
  openingFor,
  passPrice,
} from "./listing.js";
