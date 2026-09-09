/**
 * The tip jar: the one game in the building that makes chips rather than
 * moving them, and so the one whose whole design is a meter.
 */
export { NIGHT_MS, levelAt } from "./jar.js";
export type { Jar, Numbers } from "./jar.js";

export { BASE, FAVOUR_PER_CHIPS, MAX, UPGRADES, favoursFor, numbersFor } from "./ladder.js";
export type { Upgrade } from "./ladder.js";

export { guardCeiling, withinGuard } from "./guard.js";

export {
  RHYTHM_KEEP,
  RHYTHM_MEDIAN_MS,
  RHYTHM_MIN_SAMPLES,
  RHYTHM_SPREAD_MS,
  TAP_FLOOR_MS,
  remember,
  tooEven,
} from "./rhythm.js";

export { REFUSALS, buy, emptyJar, rollNight, tap } from "./tap.js";
export type { Outcome } from "./tap.js";
