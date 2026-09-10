import { useEffect, useRef } from "react";
import { ChipMark } from "../chips/Chip.js";

/**
 * A chip's trip out of the jar, on a tap.
 *
 * `CLAUDE.md`: every change is animated, and the animation says what
 * happened. A tap takes a scoop out of the jar — this is what "out of"
 * looks like: a chip leaves where the thumb hit and lands where the
 * count of the night lives.
 */

export interface FlightPoint {
  x: number;
  y: number;
}

/** Short and physical, the way every other motion in this building is. */
const DURATION_MS = 480;

/**
 * Past 1 briefly, then back — the standard "overshoot and settle" curve,
 * the same shape the jar's own wobble uses, just applied to a position
 * instead of a scale.
 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

/**
 * One chip, from `from` to `to`, driven by its own rAF loop rather than a
 * CSS transition or keyframe.
 *
 * A keyframe cannot take an argument, and every flight's start and end
 * point is different — the tap that spawned it can land anywhere on the
 * glass, and the counter it flies to can itself have moved since the last
 * layout pass. So this owns one rAF loop for its own one trip, writes
 * straight to the element's own `style` rather than through React state
 * (this runs every frame; a re-render per frame is the wrong tool), and
 * calls `onDone` exactly once, when the trip is actually over — never
 * restyled by anything outside this loop, which is what "one motion per
 * thing" means for an element whose whole job is motion.
 *
 * `position: fixed` in screen coordinates on purpose: the jar and the
 * tonight figure are two different elements a flight has to cross between,
 * and fixed viewport coordinates are the one frame both already share
 * without either of them needing to know the other exists.
 */
export function ChipFlight({
  from,
  to,
  onDone,
}: {
  from: FlightPoint;
  to: FlightPoint;
  onDone: () => void;
}) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  // Read fresh inside the loop rather than closed over, so a caller that
  // passes a new function identity every render (as an inline arrow
  // typically does) never has to restart the animation to pick it up.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    // A short apex above the straight line between the two points, so the
    // trip reads as an arc leaving the glass rather than a chip sliding
    // along the floor to its destination.
    const lift = Math.max(48, Math.abs(to.y - from.y) * 0.5);

    const tick = (now: number) => {
      const linear = Math.min(1, (now - start) / DURATION_MS);
      const eased = easeOutBack(linear);
      const x = from.x + (to.x - from.x) * eased;
      const straightY = from.y + (to.y - from.y) * linear;
      const y = straightY - lift * Math.sin(Math.PI * linear);
      const el = elRef.current;
      if (el !== null) {
        // The second translate centres the chip's own box on the point
        // rather than planting its top-left corner there.
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        // Fades out over the last fifth of the trip rather than vanishing
        // the instant it arrives, so landing reads as settling rather than
        // as the element being switched off.
        el.style.opacity = linear > 0.8 ? String(Math.max(0, (1 - linear) / 0.2)) : "1";
      }
      if (linear >= 1) {
        onDoneRef.current();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
    // Listed for the linter's sake; in practice a single flight's from/to
    // never change across its own re-renders (the caller hands over a fixed
    // pair when it spawns one), so this never actually restarts — a flight
    // does not get retargeted mid-arc if the counter's position shifts
    // later, which would be exactly the "restyled mid-motion" bug CLAUDE.md
    // calls out.
  }, [from.x, from.y, to.x, to.y]);

  return (
    <span
      ref={elRef}
      className="tips__flight"
      data-testid="chip-flight"
      style={{ transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)` }}
      aria-hidden="true"
    >
      <ChipMark size={22} />
    </span>
  );
}
