/**
 * A jar of tips, and the arithmetic that says how much is in it.
 *
 * The level is computed from a timestamp rather than ticked by a timer. There
 * is no clock per player anywhere on the server; `level` and `levelAt` are a
 * pair from which the current level follows, so a hundred thousand idle jars
 * cost nothing to keep.
 */

export interface Jar {
  /** Chips in the jar as of `levelAt`. Fractional: see `levelAt()`. */
  level: number;
  levelAt: number;
  favours: number;
  bought: string[];
  /** When the current upgrade night began. */
  nightStartedAt: number;
  /** Everything this jar has paid this night, for the guard. */
  paidThisNight: number;
  /** The token the next tap must carry. Also the compare-and-swap key. */
  token: string;
  /** The last dozen accepted gaps between taps, in ms. */
  rhythm: number[];
  /**
   * When the last ACCEPTED tap landed, or null when there has not been one.
   *
   * Not inferred from `levelAt`: `buy` also moves `levelAt` (to carry the
   * level across an upgrade at the *old* numbers), so two fields that can
   * coincide by construction are not a reliable signal of "a tap happened
   * here." The interval floor needs its own clock.
   */
  lastTapAt: number | null;
}

/** What a jar's three numbers are, once its upgrades are accounted for. */
export interface Numbers {
  brim: number;
  /** Chips per minute. */
  trickle: number;
  scoop: number;
}

/** How long a set of upgrades lasts. Rolling, so nobody is locked out at an hour. */
export const NIGHT_MS = 20 * 60 * 60 * 1000;

/**
 * Chips in the jar at `now`.
 *
 * Kept fractional on purpose. A trickle of 60/min over 500ms is half a chip,
 * and flooring on every write would discard that fraction each tap — twenty
 * taps a second would then fill the jar at nothing. Only the payout is
 * floored, so what reaches an account is always whole.
 *
 * The brim caps what the trickle may *add*, not what the jar may hold. A level
 * carried over a night turnover can sit above the brim; it is spent down
 * rather than seized, because those chips were earned.
 */
export function levelAt(jar: Jar, numbers: Numbers, now: number): number {
  if (jar.level >= numbers.brim) {
    return jar.level;
  }
  const elapsed = Math.max(0, now - jar.levelAt);
  return Math.min(numbers.brim, jar.level + (numbers.trickle * elapsed) / 60_000);
}
