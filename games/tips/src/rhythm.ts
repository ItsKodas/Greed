/**
 * Telling a hand from a metronome.
 *
 * This is the weakest of the anti-cheat layers and it is worth being honest
 * about what it does. It does not bound the faucet — the trickle does that,
 * whether the tapper is a person or a script. It makes unattended farming
 * tedious rather than impossible.
 */

/** Faster than this is not a hand. Twenty a second. */
export const TAP_FLOOR_MS = 50;
export const RHYTHM_KEEP = 12;
/** Below this many samples there is nothing to judge. */
export const RHYTHM_MIN_SAMPLES = 8;
export const RHYTHM_MEDIAN_MS = 250;
export const RHYTHM_SPREAD_MS = 15;

export function remember(gaps: readonly number[], gap: number): number[] {
  return [...gaps, gap].slice(-RHYTHM_KEEP);
}

/**
 * Whether a run of gaps is too even to have come from a hand.
 *
 * Both conditions are required, and that is the whole design of it: a person
 * tapping slowly and steadily is even but not fast, and a person tapping
 * quickly is fast but not even. Only fast *and* inhumanly regular trips it,
 * because the cost of a false positive is a refused tap for somebody who did
 * nothing wrong.
 *
 * Spread is max minus min rather than a standard deviation. It is the thing a
 * person can actually check against a printed run of numbers, and against a
 * metronome the two say the same thing anyway.
 */
export function tooEven(gaps: readonly number[]): boolean {
  if (gaps.length < RHYTHM_MIN_SAMPLES) {
    return false;
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
      : (sorted[middle] as number);
  const spread = (sorted.at(-1) as number) - (sorted[0] as number);
  return median < RHYTHM_MEDIAN_MS && spread < RHYTHM_SPREAD_MS;
}
