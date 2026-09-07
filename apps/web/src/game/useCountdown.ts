import { useEffect, useState } from "react";

/**
 * Seconds left on a clock the server set, ticking locally.
 *
 * The deadline crosses the wire as an absolute time rather than as a duration,
 * so a slow render or a slow connection cannot leave a browser counting down
 * to a moment that has already passed. Ticked twice a second, which is often
 * enough that a second never appears to be skipped and rare enough that the
 * page is not re-rendering for a clock.
 */
export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (endsAt === null) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
