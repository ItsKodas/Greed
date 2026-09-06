import type { Die } from "@greed/rules";
import { useEffect, useRef, useState } from "react";

/**
 * The shortest a throw is allowed to take.
 *
 * A floor, not a duration. A roll asked for here and answered a continent away
 * takes as long as it takes; this only stops a fast answer from making the
 * dice look like they never left the cup. The landing sound is timed against
 * the same moment, so the two agree.
 */
export const ROLL_SETTLE_MS = 700;

/** A throw this player has asked for and not yet been answered. */
export interface PendingRoll {
  /** How many dice are going up — known from the rules before the reply. */
  count: number;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function randomFace(): Die {
  return (1 + Math.floor(Math.random() * 6)) as Die;
}

/**
 * Tumbles the dice, from the moment they are thrown until they land.
 *
 * One tumble per throw, and only one. The throw begins when the player asks
 * for it rather than when the server answers, because the answer is a round
 * trip away and dice that sit still until it arrives look broken. It ends when
 * the real dice are in and the floor above has passed — so a slow reply is
 * covered by dice already in the air, and a fast one still gets a throw worth
 * watching.
 *
 * The reason this is one hook rather than a local animation and a server-driven
 * one is that two of them cannot hand over cleanly: the first stops, a frame of
 * settled dice shows, and the second starts again with a different number of
 * dice. Which is exactly what it looked like.
 */
export function useRollAnimation(
  dice: readonly Die[],
  rollSeq: number,
  pending: PendingRoll | null,
): { rolling: boolean; faces: Die[] } {
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<Die[]>(() => [...dice]);

  const landed = useRef<readonly Die[]>(dice);
  landed.current = dice;

  /** How many dice are in the air; the reply may change it. */
  const inTheAir = useRef(0);
  /** When the current tumble began, for measuring the floor against. */
  const since = useRef(0);
  const spin = useRef<number | null>(null);
  const settle = useRef<number | null>(null);

  function stopTimers(): void {
    if (spin.current !== null) {
      window.clearInterval(spin.current);
      spin.current = null;
    }
    if (settle.current !== null) {
      window.clearTimeout(settle.current);
      settle.current = null;
    }
  }

  function land(): void {
    stopTimers();
    setFaces([...landed.current]);
    setRolling(false);
  }

  // The throw. Starts on the ask, or on someone else's roll arriving.
  function throwDice(count: number): void {
    if (spin.current !== null) {
      // Already in the air. Never restart — that is the stutter.
      return;
    }
    since.current = Date.now();
    inTheAir.current = count;
    setRolling(true);
    setFaces(Array.from({ length: count }, randomFace));
    spin.current = window.setInterval(() => {
      setFaces(Array.from({ length: inTheAir.current }, randomFace));
    }, 80);
  }

  // Asked for. The dice do not exist yet, so the count comes from the rules.
  // biome-ignore lint/correctness/useExhaustiveDependencies: throwDice reads only refs and setters
  useEffect(() => {
    if (pending === null || prefersReducedMotion()) {
      return;
    }
    throwDice(pending.count);
    // Only the arrival of a throw ends it, so there is nothing to undo here.
  }, [pending]);

  // Answered — ours or anyone's. Keyed on the throw counter: the same faces
  // twice running is still a second throw, and depending on the dice would
  // restart it on every pick.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the roll counter by design
  useEffect(() => {
    if (rollSeq === 0 || dice.length === 0) {
      stopTimers();
      setFaces([...dice]);
      setRolling(false);
      return;
    }
    if (prefersReducedMotion()) {
      setFaces([...dice]);
      setRolling(false);
      return;
    }

    // Someone else's throw, or our own that we somehow did not start.
    throwDice(dice.length);
    // The reply may hold a different number than we guessed; follow it.
    inTheAir.current = dice.length;

    const elapsed = Date.now() - since.current;
    settle.current = window.setTimeout(land, Math.max(0, ROLL_SETTLE_MS - elapsed));

    return () => {
      if (settle.current !== null) {
        window.clearTimeout(settle.current);
        settle.current = null;
      }
    };
  }, [rollSeq]);

  // Dice that change while nothing is in the air — a pick, a new turn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: compared by value, not identity
  useEffect(() => {
    if (!rolling) {
      setFaces([...dice]);
    }
  }, [rolling, dice.join(",")]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount cleanup only
  useEffect(() => stopTimers, []);

  return { rolling, faces };
}
