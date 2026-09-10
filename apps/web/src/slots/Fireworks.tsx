import { useRef } from "react";
import { palette, SHOW, type Shell } from "./show.js";
import { type Size, useFireworks, type Volley } from "./useFireworks.js";

/**
 * What the machine does over its own glass when it pays.
 *
 * Shells go up from the coin tray, hang, and burst over the box they are
 * drawn in. The firework itself lives in `show.ts` and the loop that runs it
 * in `useFireworks.ts`; what is left here is the only part that is about this
 * show in particular — where the shells come from.
 */

/** How long between the first volley and the ones that follow it. */
const SECOND_MS = 520;
const THIRD_MS = 1080;

/** Straight up off the tray, from along the bottom edge. */
function fromTheTray(count: number, { width, height }: Size, colours: string[]): Shell[] {
  const shells: Shell[] = [];
  for (let n = 0; n < count; n += 1) {
    shells.push({
      x: width * (0.16 + Math.random() * 0.68),
      y: height,
      vx: 0,
      vy: -SHOW.climb * height * (0.8 + Math.random() * 0.4),
      burstAt: height * (0.12 + Math.random() * 0.34),
      hue: colours[Math.floor(Math.random() * colours.length)] as string,
    });
  }
  return shells;
}

/** A line gets a couple; a jackpot gets a barrage. */
export function trayVolleys(scale: number, size: Size, colours: string[]): Volley[] {
  const volleys: Volley[] = [
    { after: 0, shells: fromTheTray(Math.max(2, Math.round(2 * scale)), size, colours) },
    { after: SECOND_MS, shells: fromTheTray(Math.round(2 * scale), size, colours) },
  ];
  if (scale > 2) {
    volleys.push({ after: THIRD_MS, shells: fromTheTray(3, size, colours) });
  }
  return volleys;
}

export function Fireworks({
  fire,
  /** How much of a show it deserves: one for a line, more for a jackpot. */
  scale = 1,
}: {
  fire: number;
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useFireworks(canvasRef, fire, (size) => trayVolleys(scale, size, palette()));

  /*
   * Hidden on the wrapper rather than on the canvas itself. The win is
   * already said in words on the screen above and drawn on the glass below,
   * so there is nothing here to announce — and aria-hidden belongs on
   * something that was never going to take focus.
   */
  return (
    <div className="fireworks" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
