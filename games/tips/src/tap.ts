import { withinGuard } from "./guard.js";
import { NIGHT_MS, levelAt, type Jar } from "./jar.js";
import { UPGRADES, favoursFor, numbersFor } from "./ladder.js";
import { TAP_FLOOR_MS, remember, tooEven } from "./rhythm.js";

/**
 * Every refusal, in the player's language.
 *
 * Named constants rather than literals at each site, because a test that
 * asserts *which* refusal it got is asserting the rule that fired, and a
 * string typed twice is two rules that can drift apart.
 */
export const REFUSALS = {
  stale: "That tap was out of step. Try again.",
  fast: "Steady on.",
  even: "That was too even to be a hand.",
  dry: "The jar is dry — give it a moment.",
  unknown: "No such thing behind this bar.",
  owned: "You have that already.",
  poor: "Not enough favours yet.",
  guard: "The jar cannot pay that. Nothing was taken.",
} as const;

export type Outcome =
  | { ok: true; paid: number; jar: Jar }
  | { ok: false; error: string; jar: Jar };

export function emptyJar(now: number, token: string): Jar {
  return {
    level: 0,
    levelAt: now,
    favours: 0,
    bought: [],
    nightStartedAt: now,
    paidThisNight: 0,
    token,
    rhythm: [],
  };
}

/**
 * Expire the night's upgrades if it is time, leaving the level alone.
 *
 * The night is only the upgrade clock. It does not empty the jar, because the
 * jar is a rate and the night is a set of multipliers on it — and a turnover
 * that confiscated the level would take chips somebody had already earned.
 */
export function rollNight(jar: Jar, now: number): Jar {
  if (now - jar.nightStartedAt < NIGHT_MS) {
    return jar;
  }
  return { ...jar, favours: 0, bought: [], paidThisNight: 0, nightStartedAt: now };
}

/** The gap since the last accepted tap, or null when this is the first. */
function lastGap(jar: Jar, now: number): number | null {
  return jar.rhythm.length === 0 && jar.levelAt === jar.nightStartedAt ? null : now - jar.levelAt;
}

export function tap(jar: Jar, now: number, token: string, mint: () => string): Outcome {
  // The token rotates on every answer, refusals included. A client that got
  // one wrong resyncs from the jar in the reply rather than wedging.
  const refuse = (error: string, on: Jar = jar): Outcome => ({
    ok: false,
    error,
    jar: { ...on, token: mint() },
  });

  if (token !== jar.token) {
    return refuse(REFUSALS.stale);
  }

  const gap = lastGap(jar, now);
  if (gap !== null && gap < TAP_FLOOR_MS) {
    return refuse(REFUSALS.fast);
  }

  const rolled = rollNight(jar, now);
  const numbers = numbersFor(rolled.bought);
  const level = levelAt(rolled, numbers, now);
  const pay = Math.floor(Math.min(numbers.scoop, level));

  if (pay < 1) {
    return refuse(REFUSALS.dry, rolled);
  }
  if (!withinGuard(rolled.paidThisNight, pay, rolled.nightStartedAt, now)) {
    return refuse(REFUSALS.guard, rolled);
  }

  const rhythm = gap === null ? rolled.rhythm : remember(rolled.rhythm, gap);
  if (tooEven(rhythm)) {
    // Refused *before* the level is touched, so nothing is lost by tripping it.
    return refuse(REFUSALS.even, rolled);
  }

  const paidThisNight = rolled.paidThisNight + pay;
  return {
    ok: true,
    paid: pay,
    jar: {
      ...rolled,
      level: level - pay,
      levelAt: now,
      favours: rolled.favours + favoursFor(rolled.paidThisNight, paidThisNight),
      paidThisNight,
      rhythm,
      token: mint(),
    },
  };
}

export function buy(
  jar: Jar,
  now: number,
  token: string,
  upgradeId: string,
  mint: () => string,
): Outcome {
  const refuse = (error: string, on: Jar = jar): Outcome => ({
    ok: false,
    error,
    jar: { ...on, token: mint() },
  });

  if (token !== jar.token) {
    return refuse(REFUSALS.stale);
  }

  /*
   * No interval or rhythm check here, unlike a tap. Those ask how fast a hand
   * can hit a jar; a buy is a considered decision that may well follow a tap
   * by five milliseconds because the player had already made up their mind.
   */
  const rolled = rollNight(jar, now);
  const upgrade = UPGRADES.find((up) => up.id === upgradeId);
  if (upgrade === undefined) {
    return refuse(REFUSALS.unknown, rolled);
  }
  if (rolled.bought.includes(upgrade.id)) {
    return refuse(REFUSALS.owned, rolled);
  }
  if (rolled.favours < upgrade.favours) {
    return refuse(REFUSALS.poor, rolled);
  }

  /*
   * The level is carried across on the *old* numbers before the upgrade lands.
   * Buying a bigger brim must not retroactively fill the jar for the minutes
   * that passed under a smaller one.
   */
  const level = levelAt(rolled, numbersFor(rolled.bought), now);
  return {
    ok: true,
    paid: 0,
    jar: {
      ...rolled,
      level,
      levelAt: now,
      favours: rolled.favours - upgrade.favours,
      bought: [...rolled.bought, upgrade.id],
      token: mint(),
    },
  };
}
