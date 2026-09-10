import { POCKETS } from "@backroom/game-roulette";

/**
 * How the wheel and the ball lose their speed.
 *
 * One description, used three ways: the stylesheet animates from it, the
 * sound is scheduled against it, and the ticking of the rim is worked out by
 * asking it when each pocket goes past. Those three had been three separate
 * sets of numbers that "have to agree", which is a comment this repo has
 * written more than once and is the kind of agreement that lasts until the
 * first change.
 *
 * A profile is a velocity curve, not a position curve, because velocity is
 * what a thing slowing down actually has and it is the only form in which any
 * of this is worth arguing about. Position is its integral and falls out.
 */
export interface Profile {
  /** How much of the spin is spent barely slowing at all. */
  free: number;
  /** What share of its speed it still has at the end of that. */
  keep: number;
  /**
   * How the rest of the speed goes.
   *
   * Above one the deceleration eases off as it settles; at one it is constant;
   * below one it runs away at the end and the thing is yanked to a halt rather
   * than coming to rest. Every wrong version of this animation was a wrong
   * value here.
   */
  tail: number;
}

/**
 * The wheel: heavy, on a bearing, so it barely slows and then gives its speed
 * up over most of the spin.
 *
 * The tail is the number that matters and it has been raised twice. Higher
 * means the deceleration eases off further as the wheel settles, so the last
 * of the speed goes slowly instead of at the rate the middle of the spin was
 * losing it — which is the difference between a wheel running down and a wheel
 * being stopped, and is what "still slowing too quickly at the end" was.
 */
export const RIM: Profile = { free: 0.15, keep: 0.98, tail: 1.8 };

/**
 * The ball: a hard rim holds its speed almost completely, and then it comes
 * off the track and dies among the frets.
 */
export const BALL: Profile = { free: 0.55, keep: 0.86, tail: 1.8 };

/** How fast it is going, as a share of its launch speed. */
export function speed(profile: Profile, t: number): number {
  if (t <= profile.free) {
    return 1 - (1 - profile.keep) * (t / profile.free);
  }
  const through = (t - profile.free) / (1 - profile.free);
  return profile.keep * (1 - through) ** profile.tail;
}

/** How many samples the integral is taken over. Fine enough to be exact here. */
const STEPS = 2_000;

/**
 * How far round it is at time `t`, from nought to one.
 *
 * The integral of the speed, normalised so a spin covers exactly its turns.
 */
export function progress(profile: Profile): (t: number) => number {
  const cumulative: number[] = [0];
  for (let step = 1; step <= STEPS; step += 1) {
    const from = (step - 1) / STEPS;
    const to = step / STEPS;
    cumulative.push(
      (cumulative[step - 1] as number) + ((speed(profile, from) + speed(profile, to)) / 2) * (1 / STEPS),
    );
  }
  const total = cumulative[STEPS] as number;
  return (t: number) => {
    const at = Math.min(STEPS, Math.max(0, Math.round(t * STEPS)));
    return (cumulative[at] as number) / total;
  };
}

/**
 * The profile as a CSS timing function.
 *
 * Sampled densely over the last stretch and to six decimals, both for the same
 * reason: near the end there is very little progress left to describe, and at
 * coarser resolution the settle collapses into a handful of visible steps.
 */
export function easing(profile: Profile): string {
  const at = progress(profile);
  const points = [...Array.from({ length: 18 }, (_, i) => i / 20), 0.9, 0.92, 0.94, 0.96, 0.97, 0.98, 0.99, 0.995, 1];
  return `linear(${points
    .map((t) => (t === 0 ? "0" : t === 1 ? "1" : `${at(t).toFixed(6)} ${+(t * 100).toFixed(4)}%`))
    .join(", ")})`;
}

/**
 * When each pocket goes past the marker, as shares of the spin.
 *
 * This is the ticking. A wheel passing a fixed point clicks once per pocket,
 * so the clicks are not a rhythm anybody chooses — they are the rotation,
 * heard. Working them out from the same curve the rim is animated by is what
 * makes them land on the pockets a player can watch going past, and is the
 * whole reason this file exists rather than a second set of timings.
 *
 * Every pocket gets one. An earlier version dropped any click within 55ms of
 * the last, on the theory that fifty a second is a buzz rather than a tick —
 * which was wrong twice over. It is what a wheel at speed actually sounds
 * like, and cutting them left a faint ticking through the slow tail only,
 * which is the opposite of the thing being drawn. `closest` survives as a
 * guard against a degenerate profile scheduling thousands, not as a thinning.
 */
export function ticks(profile: Profile, turns: number, closest = 0.002): number[] {
  const at = progress(profile);
  const total = turns * POCKETS;
  const out: number[] = [];
  let last = Number.NEGATIVE_INFINITY;
  let step = 0;
  /*
   * Walked forward rather than solved. The curve is monotonic, so one pass
   * over a fine grid finds every crossing in order and costs nothing.
   */
  for (let sample = 1; sample <= STEPS; sample += 1) {
    const t = sample / STEPS;
    const passed = Math.floor(at(t) * total);
    while (step < passed) {
      step += 1;
      if (t - last >= closest) {
        out.push(t);
        last = t;
      }
    }
  }
  return out;
}
