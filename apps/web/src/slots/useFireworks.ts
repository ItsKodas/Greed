import { type RefObject, useEffect, useRef } from "react";
import { burning, type Shell } from "./show.js";

/**
 * The plumbing behind a firework show: a canvas, a clock, and a loop.
 *
 * Everything here is the same whether the shells go up off the coin tray or
 * out of the sides of the cabinet, so it is written once. What a show has to
 * say for itself is its plan — where its shells start and which way they are
 * thrown — and that is all a caller passes.
 *
 * It runs only while there is something burning. A win starts the loop, the
 * last spark stops it, and between wins there is no frame being scheduled at
 * all — this sits over a machine somebody may leave open for an hour.
 */

/** A handful of shells, and how long after the win they go up. */
export interface Volley {
  after: number;
  shells: Shell[];
}

/** The canvas the plan is drawn against, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

export function useFireworks(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  /**
   * Bumped once per win. A number rather than a boolean because two wins in a
   * row are two shows, and a flag that was already true would light nothing.
   */
  fire: number,
  plan: (size: Size) => Volley[],
): void {
  /*
   * Held in a ref because the effect below wakes on `fire` alone. A plan
   * rebuilt every render would otherwise restart the show on any state change
   * the page happened to make mid-burst.
   */
  const planned = useRef(plan);
  planned.current = plan;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d") ?? null;
    if (canvas === null || context === null) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The win is already said in words and lit on the glass. This is the
      // part that can go without taking any meaning with it.
      return;
    }
    if (fire === 0) {
      return;
    }

    const show = burning();
    let width = 0;
    let height = 0;
    let frame = 0;
    let looping = false;
    let last = performance.now();

    const size = () => {
      /*
       * Capped below the real device ratio, as the haze is. Sparks are small
       * bright dots; a retina buffer costs four times the fill for detail
       * nobody can see at this size and speed.
       */
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    size();

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.05);
      last = now;
      show.advance(step, height);
      context.clearRect(0, 0, width, height);
      show.paint(context, step);
      if (!show.alive()) {
        // Nothing left burning: stop scheduling frames entirely.
        looping = false;
        context.clearRect(0, 0, width, height);
        return;
      }
      frame = window.requestAnimationFrame(draw);
    };

    const waiting: number[] = [];
    const send = (volley: Volley) => {
      for (const shell of volley.shells) {
        show.launch(shell);
      }
      if (looping) {
        // A later volley going up over a burst that is still burning. One loop
        // is already drawing them both; a second would draw every spark twice
        // and step it twice as fast.
        return;
      }
      looping = true;
      // Not the timestamp the last show ended on: the gap between them would
      // arrive as one enormous step and throw the first frame off the page.
      last = performance.now();
      frame = window.requestAnimationFrame(draw);
    };

    for (const volley of planned.current({ width, height })) {
      if (volley.shells.length === 0) {
        continue;
      }
      if (volley.after <= 0) {
        send(volley);
        continue;
      }
      waiting.push(window.setTimeout(() => send(volley), volley.after));
    }

    window.addEventListener("resize", size);
    return () => {
      window.cancelAnimationFrame(frame);
      looping = false;
      for (const later of waiting) {
        window.clearTimeout(later);
      }
      window.removeEventListener("resize", size);
      show.clear();
      context.clearRect(0, 0, width, height);
    };
  }, [fire, canvasRef]);
}
