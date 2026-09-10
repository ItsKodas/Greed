import { useEffect, useRef } from "react";
import { play, spinWheel } from "../game/audio.js";

/**
 * The sound of a spin, tied to the spin itself.
 *
 * A hook rather than calls scattered through the component, for one reason:
 * the sound and the animation have to be started by the same event. Both are
 * scheduled from the moment the ball is released and both last exactly as long
 * as the table waits, so if they are triggered separately they can only drift
 * — and the first thing a listener notices is a clatter that does not land
 * with the ball they are watching.
 *
 * The shares below are the animation's own, and are passed through rather than
 * chosen here. They belong to the stylesheet; this only needs to know them,
 * and a second set of figures would be a second thing to keep in step.
 */
export function useSpinSound(
  turning: boolean,
  spinMs: number,
  /** Where the wheel stops and where the ball drops, as shares of the spin. */
  shape: { rimAt: number; dropAt: number; ticks: readonly number[] },
): void {
  const end = useRef<(() => void) | null>(null);
  /*
   * The shape is read through a ref so it is not a dependency. It is a fresh
   * object every render and would restart the sound on any re-render at all —
   * a chip going down mid-spin would cut the ball off and start it again.
   */
  const held = useRef(shape);
  held.current = shape;

  useEffect(() => {
    if (!turning) {
      return;
    }
    play("noMoreBets");
    end.current = spinWheel({ spinMs, ...held.current });
    return () => {
      end.current?.();
      end.current = null;
    };
  }, [turning, spinMs]);
}

/**
 * The number, once the ball is in it.
 *
 * Separate from the spin because it is not part of it: the spin's sound is
 * scheduled when the ball is released and cannot know what the ball will do,
 * and this fires on the pocket arriving. Which also means it fires once per
 * result rather than once per render, however often the felt redraws.
 */
export function useCalledSound(pocket: number | null, turning: boolean): void {
  const said = useRef<number | null>(null);

  useEffect(() => {
    if (turning || pocket === null) {
      // A new spin clears it, so the same number twice running still sounds.
      if (turning) {
        said.current = null;
      }
      return;
    }
    if (said.current === pocket) {
      return;
    }
    said.current = pocket;
    play("numberUp");
  }, [pocket, turning]);
}
