import { type RefObject, useRef } from "react";
import { createPortal } from "react-dom";
import { palette, SHOW, type Shell } from "./show.js";
import { type Size, useFireworks, type Volley } from "./useFireworks.js";

/**
 * What a real win does to the rest of the room.
 *
 * The glass celebrates every line, because that is the machine answering you.
 * This is the other thing: shells that leave the sides of the cabinet, arc out
 * over the page and burst in the space either side of it — and there are more
 * of them the bigger the win, which is the whole point. How many is decided
 * by `roomShow` in Slots.tsx, against what the spin cost.
 *
 * It paints behind the page rather than over it, on the same layer as the
 * haze. That is what makes the shells read as coming from *behind* the
 * machine: they disappear behind the cabinet and reappear out in the room,
 * which is what a firework going off behind something actually does. Over the
 * top it would be confetti thrown at the reels.
 */

/** How long between volleys, so a big win is a show rather than one flash. */
const BETWEEN_MS = 380;
/** Shells in one volley. A big win gets more volleys, not a bigger bang. */
const PER_VOLLEY = 3;

/** The sides of the machine, in viewport coordinates. */
export interface Flank {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The least room a shell is given to arc into, as a fraction of the page.
 *
 * On a desk the space beside the cabinet is the answer on its own. On a phone
 * there is none, and a shell given the true answer would go straight up behind
 * the machine and never be seen. This is the floor under that.
 */
const LEAST_REACH = 0.12;

function outOfTheSide(
  side: -1 | 1,
  cabinet: Flank,
  { width, height }: Size,
  colours: string[],
): Shell {
  const from = side === -1 ? cabinet.left : cabinet.right;
  /* Up the flank rather than off the floor: they leave the machine's middle. */
  const y = cabinet.top + (cabinet.bottom - cabinet.top) * (0.3 + Math.random() * 0.45);
  const vy = -SHOW.climb * height * (0.8 + Math.random() * 0.4);
  const burstAt = height * (0.08 + Math.random() * 0.26);
  /*
   * Thrown to land its burst out in the open, which means the sideways speed
   * is whatever covers that ground in the time it spends climbing — not a
   * number picked by eye. Otherwise the same shell reaches the edge of a phone
   * and a third of the way across a desk.
   */
  const room = side === -1 ? cabinet.left : width - cabinet.right;
  const reach = Math.max(room, width * LEAST_REACH) * (0.45 + Math.random() * 0.55);
  const climbing = Math.max(y - burstAt, 1) / Math.abs(vy);

  return {
    x: from,
    y,
    vx: (side * reach) / climbing,
    vy,
    burstAt,
    hue: colours[Math.floor(Math.random() * colours.length)] as string,
  };
}

export function roomVolleys(
  shells: number,
  cabinet: Flank,
  size: Size,
  colours: string[],
): Volley[] {
  const volleys: Volley[] = [];
  for (let sent = 0; sent < shells; sent += PER_VOLLEY) {
    const going: Shell[] = [];
    for (let n = sent; n < Math.min(sent + PER_VOLLEY, shells); n += 1) {
      // Alternating, so the two sides answer each other rather than one side
      // getting the whole show by chance.
      going.push(outOfTheSide(n % 2 === 0 ? -1 : 1, cabinet, size, colours));
    }
    volleys.push({ after: (volleys.length * BETWEEN_MS), shells: going });
  }
  return volleys;
}

export function RoomFireworks({
  fire,
  /** How many shells this win earned. Zero for one that stayed on the glass. */
  shells,
  /** The machine itself, so the shells know which edges to leave from. */
  from,
}: {
  fire: number;
  shells: number;
  from: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useFireworks(canvasRef, fire, (size) => {
    const cabinet = from.current?.getBoundingClientRect();
    if (cabinet === undefined || shells === 0) {
      return [];
    }
    return roomVolleys(shells, cabinet, size, palette());
  });

  /*
   * Out to the body rather than rendered where it is used. The page is a
   * stacking context of its own, so a canvas inside it cannot paint behind the
   * machine it is supposed to be coming from — and it has to be fixed to the
   * viewport rather than to a box on the page, because the room is the whole
   * window.
   */
  return createPortal(
    <div className="room-fireworks" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>,
    document.body,
  );
}
