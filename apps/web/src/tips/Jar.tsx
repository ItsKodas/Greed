import type { MouseEvent } from "react";

/**
 * The glass, and the tap target.
 *
 * There is no counter here on purpose — no "1,240 / 1,500". The jar's level
 * *is* the game's state, and a player who can see how full it is does not
 * need it repeated as a fraction underneath. Drawing it any other way would
 * make the glass decoration for a number instead of the number's only home.
 */

/** Where a press landed, in the viewport's own coordinates. */
export interface TapPoint {
  x: number;
  y: number;
}

export interface JarProps {
  /** Chips showing in the glass right now — reconciled, or optimistic. */
  level: number;
  brim: number;
  /**
   * Where the thumb hit, so a chip can be shown leaving from there rather
   * than from the middle of the glass every time.
   */
  onTap: (point: TapPoint) => void;
  /**
   * Bumped once per accepted press, so the glass wobbles exactly once.
   *
   * A `key` on the wobbling part rather than a class toggled on and off: CSS
   * cannot replay a running animation by re-adding the class it never left,
   * and a state flag flipped true-then-false-on-a-timer is the same animation
   * fighting its own cleanup on a fast run of taps.
   */
  tapped: number;
}

/** The glass, in its own coordinates. Also the clip for what it holds. */
const GLASS_PATH = "M46,36 H154 V228 A14,14 0 0 1 140,242 H60 A14,14 0 0 1 46,228 Z";
const GLASS_TOP = 36;
const GLASS_BOTTOM = 242;

export function Jar({ level, brim, onTap, tapped }: JarProps) {
  const pct = brim > 0 ? Math.min(1, Math.max(0, level / brim)) : 0;
  const liquidY = GLASS_BOTTOM - (GLASS_BOTTOM - GLASS_TOP) * pct;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // clientX/Y are 0 on a keyboard-activated click (Enter/Space on a
    // focused button never moved a pointer), which would otherwise send a
    // flight arcing from the top-left corner of the screen. The button's
    // own centre is the honest answer for a press that has no point.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    onTap({ x, y });
  };

  return (
    <button
      type="button"
      className="jar"
      aria-label="Tap the jar"
      onClick={handleClick}
      // A chip already clinks out of the glass on this press — the
      // building-wide tap click underneath it would be a second sound for
      // the same one event, same as the felt's own chip buttons.
      data-quiet
    >
      {/* Reset every accepted tap, and only then — a jar sitting untapped
          must not wobble on its own. */}
      <span className={`jar__wobble${tapped > 0 ? " jar__wobble--tap" : ""}`} key={tapped}>
        <svg viewBox="0 0 200 260" className="jar__glass" aria-hidden="true">
          <defs>
            <clipPath id="jar-clip">
              <path d={GLASS_PATH} />
            </clipPath>
          </defs>
          <rect x="76" y="14" width="48" height="26" rx="5" className="jar__lid" />
          <g clipPath="url(#jar-clip)">
            <rect
              className="jar__liquid"
              x="30"
              y={liquidY}
              width="140"
              height={Math.max(0, GLASS_BOTTOM - liquidY + 20)}
            />
            {/* A line of light across the top of the fill, so a jar sitting
                still still reads as liquid rather than a filled rectangle. */}
            <rect className="jar__shine" x="30" y={liquidY} width="140" height="6" />
          </g>
          <path className="jar__outline" d={GLASS_PATH} />
        </svg>
      </span>
    </button>
  );
}
