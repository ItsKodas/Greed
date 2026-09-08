import type { Face } from "@backroom/game-slots";
import { useEffect, useRef, useState } from "react";
import { FACE_SIZE, ReelFace } from "./Symbols.js";

/**
 * One column, and how it stops.
 *
 * A spinning reel is a face-down card: the motion is honest, the face is the
 * fact. So the reel starts turning on the press — nothing waits for the server
 * to acknowledge a pull — and it only ever shows faces the server has actually
 * sent. There is one arrival, not two: the reel that started turning is the
 * reel that stops on the answer.
 *
 * Two floors keep that true. A reel spins for at least SPIN_UP_MS however fast
 * the reply, because a reel that stops before it has visibly started reads as
 * a machine that had decided before you pulled. And each reel waits a further
 * REEL_STAGGER_MS per place to its right, so the row settles left to right and
 * the last reel is the one worth holding your breath for.
 */

/**
 * The shortest a reel may spin, however quickly the answer lands.
 *
 * Just under a second. It was three hundred milliseconds, which is long
 * enough to see and far too short to feel: the row had settled before the
 * player's hand was off the lever, and a machine that answers that fast reads
 * as one that had the answer ready — which it did, but it should not look
 * like it.
 */
export const SPIN_UP_MS = 950;

/**
 * How much longer each reel spins than the one to its left.
 *
 * Wide enough that the reels land as five separate events rather than one
 * ripple. Five reels at this spacing put the last one a shade over two
 * seconds after the lever, which is about where a real cabinet sits.
 */
export const REEL_STAGGER_MS = 280;

/**
 * The window the cabinet shows, named rather than counted.
 *
 * A reel has exactly these three cells and they never move; what changes is
 * the face in one. Naming them gives each cell a stable identity for React,
 * which an array index only looks like.
 */
const ROWS = ["top", "middle", "bottom"] as const;

export function Reel({
  column,
  spinning,
  index,
  resting,
  holdMs = 0,
  onStop,
}: {
  /** What the server said is on this reel, or nothing while it is still out. */
  column: Face[] | undefined;
  /** Whether a pull is in the air. */
  spinning: boolean;
  /** Which reel this is, left to right. */
  index: number;
  /**
   * What to show before anybody has pulled anything.
   *
   * Not a result and never presented as one — dimmed, with nothing lit and
   * nothing said. A cabinet standing idle shows faces; one showing a blur
   * before you have touched it looks like it is already running.
   */
  resting?: Face[];
  /**
   * Longer on the brake, for a reel the answer is still riding on.
   *
   * The server has already said what every reel holds, so this invents
   * nothing — it only chooses how long to take saying it. Which is what a
   * machine does when the first three reels have come up sevens.
   */
  holdMs?: number;
  /** Called the moment this reel actually settles, for the sound. */
  onStop?: () => void;
}) {
  /*
   * What is on the glass, which is not the same as what the server has said.
   * A reel showing nothing is a reel spinning, so this is the whole of the
   * component's state: no separate "am I spinning" flag to fall out of step
   * with it.
   */
  const [shown, setShown] = useState<Face[] | undefined>(column);
  const startedAt = useRef(Date.now());
  const wasSpinning = useRef(spinning);
  /** Whether this reel has ever been asked to turn, which ends the rest state. */
  const everSpun = useRef(false);
  /*
   * Held in a ref so a caller that rebuilds the callback each render does not
   * restart the timer underneath a spin that is already in the air.
   */
  const stopped = useRef(onStop);
  stopped.current = onStop;

  useEffect(() => {
    if (spinning && !wasSpinning.current) {
      // A new pull. Clear the glass and start the clock.
      everSpun.current = true;
      startedAt.current = Date.now();
      setShown(undefined);
    }
    wasSpinning.current = spinning;
  }, [spinning]);

  useEffect(() => {
    if (column === undefined || shown !== undefined) {
      return;
    }
    /*
     * However long is left of this reel's spin, and no less than nothing: an
     * answer that took longer than the floor stops the reel at once rather
     * than adding a wait nobody asked for.
     */
    const floor = SPIN_UP_MS + index * REEL_STAGGER_MS + holdMs;
    const left = Math.max(0, floor - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => {
      setShown(column);
      stopped.current?.();
    }, left);
    return () => window.clearTimeout(timer);
  }, [column, shown, index, holdMs]);

  /*
   * At rest only before the first pull. After that an empty reel means one
   * that is still out, and showing anything but a blur there would be
   * guessing at the answer.
   */
  const resting_ = shown === undefined && !spinning && !everSpun.current ? resting : undefined;
  const turning = shown === undefined && resting_ === undefined;
  const faces = shown ?? resting_;

  return (
    <div
      className={`reel${turning ? " reel--spinning" : ""}${resting_ === undefined ? "" : " reel--resting"}`}
    >
      <svg
        className="reel__glass"
        viewBox={`0 0 ${FACE_SIZE} ${FACE_SIZE * ROWS.length}`}
        role="img"
        aria-label={turning ? "Spinning" : (faces ?? []).join(", ")}
      >
        {turning ? (
          /*
           * A blur rather than invented faces. Showing real ones here would be
           * guessing at the answer, and showing the previous spin's would read
           * as a reel that never moved.
           */
          <g className="reel__blur">
            {[0, 1, 2, 3].map((band) => (
              <rect
                key={band}
                x="8"
                y={band * FACE_SIZE * 0.75 + 6}
                width={FACE_SIZE - 16}
                height={FACE_SIZE * 0.42}
                rx="8"
                fill="currentColor"
                opacity={0.16 + (band % 2) * 0.06}
              />
            ))}
          </g>
        ) : (
          (faces ?? []).map((face, row) => (
            <g key={ROWS[row] ?? row} transform={`translate(0 ${row * FACE_SIZE})`}>
              <ReelFace face={face} />
            </g>
          ))
        )}
      </svg>
    </div>
  );
}
