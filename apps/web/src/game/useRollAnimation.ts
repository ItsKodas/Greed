import type { Die } from "@greed/rules";
import { useEffect, useRef, useState } from "react";

/**
 * How long the dice tumble before settling on what the server rolled.
 *
 * The sound is timed against this too: the shake plays as the dice start
 * moving and the landing plays as they stop, so the two line up.
 */
export const ROLL_SETTLE_MS = 700;

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
 * Tumbles the dice for a moment after each roll, then shows the real faces.
 *
 * Keyed on the server's roll counter rather than on the dice, so rolling the
 * same faces twice running still animates.
 */
export function useRollAnimation(
  dice: readonly Die[],
  rollSeq: number,
): { rolling: boolean; faces: Die[] } {
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<Die[]>(() => [...dice]);
  const settled = useRef<readonly Die[]>(dice);

  settled.current = dice;

  useEffect(() => {
    if (dice.length === 0) {
      setFaces([]);
      setRolling(false);
      return;
    }
    if (rollSeq === 0 || prefersReducedMotion()) {
      setFaces([...dice]);
      setRolling(false);
      return;
    }

    setRolling(true);
    setFaces(dice.map(randomFace));

    const spin = window.setInterval(() => {
      setFaces(settled.current.map(randomFace));
    }, 80);
    const stop = window.setTimeout(() => {
      window.clearInterval(spin);
      setFaces([...settled.current]);
      setRolling(false);
    }, ROLL_SETTLE_MS);

    return () => {
      window.clearInterval(spin);
      window.clearTimeout(stop);
    };
    // Only a new roll restarts the tumble; picking dice up must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq]);

  // A roll that arrives while one is already showing (or on first mount)
  // still needs the real faces once the tumble is over.
  useEffect(() => {
    if (!rolling) {
      setFaces([...dice]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, dice.join(",")]);

  return { rolling, faces };
}
