import { useState } from "react";
import { ReelFace } from "../slots/Symbols.js";

/**
 * Proposed reel faces, next to the ones on the machine now.
 *
 * A mockup and nothing else: the machine imports none of this, so nothing here
 * can change what anybody is playing. It is here to be argued with.
 *
 * The set on the right is drawn from this building rather than from a fruit
 * machine — a tumbler, a cigar, a thrown pair of dice, a spade, a stack of
 * chips, the neon seven that was already the best of the old lot, and a star
 * for the bonus. Every silhouette is different, which is what actually does
 * the work at 57px on a phone: a trapezoid, a diagonal, a cluster of cubes, a
 * pip, a squat stack, a numeral, a burst.
 *
 * Each one also carries its own win animation, and each says something about
 * the object rather than being the same pulse seven times: the dice tumble, a
 * chip is paid onto the stack, the ember flares, the glass rattles.
 */

/** Every proposed face, cheapest first, the way a paytable reads. */
export const PROPOSED = [
  "tumbler",
  "cigar",
  "dice",
  "spade",
  "stack",
  "seven",
  "bonus",
] as const;

export type Proposed = (typeof PROPOSED)[number];

const LABEL: Record<Proposed, string> = {
  tumbler: "Tumbler",
  cigar: "Cigar",
  dice: "Dice",
  spade: "Spade",
  stack: "Chips",
  seven: "Seven",
  bonus: "Bonus",
};

/** What the current machine shows, for the comparison. */
export const CURRENT = ["chip", "dice", "spade", "horseshoe", "bell", "seven"] as const;

/** Shading shared by every proposed face, mounted once. */
function Defs() {
  return (
    <svg className="mock__defs" aria-hidden="true" focusable="false">
      <title>Shading</title>
      <defs>
        <linearGradient id="mk-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dff1f6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#8fb7c4" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="mk-whisky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8a13c" />
          <stop offset="100%" stopColor="#a55c11" />
        </linearGradient>
        <linearGradient id="mk-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8d6237" />
          <stop offset="100%" stopColor="#4e3319" />
        </linearGradient>
        <linearGradient id="mk-dice" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#eef1f6" />
          <stop offset="100%" stopColor="#c3ccda" />
        </linearGradient>
        <linearGradient id="mk-spade" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#a9c8ee" />
          <stop offset="55%" stopColor="#7fa8d8" />
          <stop offset="100%" stopColor="#4e77a8" />
        </linearGradient>
        {/* The wall of the chip, darker down the side as a real one is. */}
        <linearGradient id="mk-chip-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8973a" />
          <stop offset="100%" stopColor="#6d4d11" />
        </linearGradient>
        <linearGradient id="mk-chip" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#f7d478" />
          <stop offset="55%" stopColor="#e0b048" />
          <stop offset="100%" stopColor="#a97c22" />
        </linearGradient>
        <linearGradient id="mk-neon" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="var(--gr-color-neon-core, #ffe8f7)" />
          <stop offset="55%" stopColor="var(--gr-color-neon-hi, #ff86d4)" />
          <stop offset="100%" stopColor="var(--gr-color-neon, #c9439e)" />
        </linearGradient>
        <linearGradient id="mk-star" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="45%" stopColor="#ffd24a" />
          <stop offset="100%" stopColor="#d98a10" />
        </linearGradient>
        <radialGradient id="mk-ground" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#000" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mk-ember" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff1c4" />
          <stop offset="45%" stopColor="#ff8a2b" />
          <stop offset="100%" stopColor="#b52d05" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * One die, with a top and a right face so it reads as a cube.
 *
 * `pips` are in units of the half-face, so the same list places them however
 * big the die is drawn.
 */
function Die({
  x,
  y,
  size,
  rot,
  pips,
}: {
  x: number;
  y: number;
  size: number;
  rot: number;
  pips: [number, number][];
}) {
  const lean = size * 0.42;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {/* The top, tilted away, and the right side falling off it. */}
      <path
        d={`M${-size} ${-size} L${-size + lean} ${-size - lean} L${size + lean} ${-size - lean} L${size} ${-size} Z`}
        fill="#ffffff"
      />
      <path
        d={`M${size} ${-size} L${size + lean} ${-size - lean} L${size + lean} ${size - lean} L${size} ${size} Z`}
        fill="#b9c3d2"
      />
      <rect x={-size} y={-size} width={size * 2} height={size * 2} rx={size * 0.24} fill="url(#mk-dice)" />
      {pips.map(([px, py]) => (
        <circle
          key={`${px},${py}`}
          cx={px * size * 0.52}
          cy={py * size * 0.52}
          r={size * 0.19}
          fill="#1b2028"
        />
      ))}
    </g>
  );
}

/** The shadow every face sits on, so none of them float. */
function Ground({ rx = 18, cy = 22 }: { rx?: number; cy?: number }) {
  return <ellipse cx="0" cy={cy} rx={rx} ry="4.5" fill="url(#mk-ground)" />;
}

/*
 * Each face is drawn in the same 60-unit box the machine uses, centred, and
 * split into the part that holds still and the part its win animation moves.
 * The moving part carries a class the stylesheet drives, so the animation and
 * the drawing stay in one place each.
 */
const ART: Record<Proposed, React.ReactNode> = {
  tumbler: (
    <>
      <Ground rx={15} cy={20} />
      {/*
       * The whole glass moves, not the drink inside it. Rocking only the pour
       * tipped the liquid straight out through the side of the glass, which
       * is a good deal more than a win is worth.
       */}
      <g className="mk-move mk-move--tumbler">
        <path d="M-11 -1 H11 L9.5 15 H-9.5 Z" fill="url(#mk-whisky)" />
        <rect x="-5" y="1" width="7" height="7" rx="1.6" fill="#fff" opacity="0.28" />
        <path
          d="M-13 -14 H13 L10 16 H-10 Z"
          fill="url(#mk-glass)"
          fillOpacity="0.4"
          stroke="#dff1f6"
          strokeOpacity="0.8"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M-9 -11 L-7 12"
          stroke="#fff"
          strokeOpacity="0.55"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    </>
  ),
  cigar: (
    <>
      <Ground rx={17} />
      <g transform="rotate(-24)">
        <rect x="-20" y="-6" width="34" height="12" rx="5" fill="url(#mk-leaf)" />
        {/* The band, because a cigar without one is a brown rectangle. */}
        <rect x="0" y="-6" width="7" height="12" fill="#c8a03c" />
        <path d="M-20 -3 H10" stroke="#fff" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" />
        <g className="mk-move mk-move--cigar">
          <circle cx="17" cy="0" r="7" fill="url(#mk-ember)" />
          <circle cx="15" cy="0" r="3.4" fill="#ffb347" />
        </g>
      </g>
    </>
  ),
  dice: (
    <>
      <Ground rx={17} cy={21} />
      {/*
       * A pair, and built with a top and a side rather than drawn flat on.
       *
       * A die seen square-on is a rounded rectangle with dots in it — the same
       * shape as a card, a domino or a matchbook. The two extra faces are what
       * make the outline unmistakable at 57px, and a pair reads as a throw
       * rather than as an object sitting still.
       */}
      <g className="mk-move mk-move--dice">
        <Die x={5} y={2} size={13} rot={12} pips={[[0, 0]]} />
        <Die
          x={-8}
          y={-2}
          size={11}
          rot={-16}
          pips={[
            [-1, -1],
            [1, 1],
          ]}
        />
      </g>
    </>
  ),
  spade: (
    <>
      <Ground rx={16} />
      <g className="mk-move mk-move--spade">
        <path
          transform="scale(1.32)"
          d="M0 -13 C 8 -5, 14 -2, 14 2 C 14 6, 10 8, 6 8 C 3 8, 1 7, 0 5 C -1 7, -3 8, -6 8 C -10 8, -14 6, -14 2 C -14 -2, -8 -5, 0 -13 Z M-1 5 C -2 8, -4 10, -6 11 L 6 11 C 4 10, 2 8, 1 5 Z"
          fill="url(#mk-spade)"
        />
        {/* A lit facet down the left lobe, which is what stops it reading flat. */}
        <path
          d="M-2 -15 C -8 -6, -15 -3, -15 3 C -15 6, -13 8, -10 8 C -13 4, -11 -2, -2 -11 Z"
          fill="#fff"
          opacity="0.3"
        />
      </g>
    </>
  ),
  stack: (
    <>
      <Ground rx={17} cy={22} />
      {/*
       * A stack rather than a chip.
       *
       * One disc is a circle with a pattern on it however it is shaded, and it
       * has to sit in a row beside a glass, a cigar and a key — all objects
       * with a height. Three of them stacked is money, reads at a glance from
       * its outline alone, and gives the win something to actually do.
       */}
      <g className="mk-move mk-move--stack">
        {[10, 3, -4].map((y, tier) => (
          <g key={y}>
            <path
              d={`M-16 ${y} A 16 6.4 0 0 0 16 ${y} L 16 ${y + 5} A 16 6.4 0 0 1 -16 ${y + 5} Z`}
              fill="url(#mk-chip-wall)"
            />
            {[-12, -6, 0, 6, 12].map((x) => (
              <rect
                key={x}
                x={x - 1.2}
                y={y + 1.4 - Math.abs(x) * 0.16}
                width="2.4"
                height="5"
                rx="1"
                fill="#f7ecd6"
                opacity={tier === 2 ? 0.85 : 0.6}
              />
            ))}
            <ellipse cx="0" cy={y} rx="16" ry="6.4" fill="url(#mk-chip)" />
          </g>
        ))}
        {/* Only the top one shows a face; the rest are edges. */}
        <ellipse
          cx="0"
          cy="-4"
          rx="12"
          ry="4.6"
          fill="none"
          stroke="#f7ecd6"
          strokeWidth="3.4"
          strokeDasharray="5.5 5"
        />
        <ellipse cx="0" cy="-4" rx="5.4" ry="2.1" fill="#a97c22" opacity="0.45" />
      </g>
      {/* The one being paid in, which only exists while it is landing. */}
      <g className="mk-drop">
        <path d="M-16 -13 A 16 6.4 0 0 0 16 -13 L 16 -8 A 16 6.4 0 0 1 -16 -8 Z" fill="url(#mk-chip-wall)" />
        <ellipse cx="0" cy="-13" rx="16" ry="6.4" fill="url(#mk-chip)" />
        <ellipse
          cx="0"
          cy="-13"
          rx="12"
          ry="4.6"
          fill="none"
          stroke="#f7ecd6"
          strokeWidth="3.4"
          strokeDasharray="5.5 5"
        />
      </g>
    </>
  ),
  seven: (
    <>
      <Ground rx={14} />
      <g className="mk-move mk-move--seven">
        <path d="M-11 -16 L11 -16 L11 -10 L2 16 L-5 16 L4 -10 L-11 -10 Z" fill="url(#mk-neon)" />
        <path d="M-9 -14 L9 -14" stroke="#fff" strokeOpacity="0.65" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </>
  ),
  bonus: (
    <>
      <Ground rx={18} />
      <g className="mk-move mk-move--bonus">
        <path
          d="M0 -19 L5.6 -6.2 L19.5 -4.7 L9.2 4.8 L12 18.4 L0 11.6 L-12 18.4 L-9.2 4.8 L-19.5 -4.7 L-5.6 -6.2 Z"
          fill="url(#mk-star)"
          stroke="#8a5200"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M0 -14 L3.6 -5.4 L-3.6 -5.4 Z" fill="#fff" opacity="0.45" />
      </g>
    </>
  ),
};

function Face({ face, won }: { face: Proposed; won: boolean }) {
  return (
    <svg
      className={`mock__face${won ? " mock__face--won" : ""}`}
      viewBox="0 0 60 60"
      role="img"
      aria-label={LABEL[face]}
    >
      <g transform="translate(30 30)">{ART[face]}</g>
    </svg>
  );
}

export function SlotMockup() {
  const [won, setWon] = useState(false);

  return (
    /*
     * Dressed in the machine's own room. Two of these faces burn in whatever
     * colour the room is lit — on this page, unthemed, the sevens came out the
     * building's blue, which is not a colour they are ever shown in.
     */
    <section className="gallery__section" data-game="slots">
      <Defs />
      <h2 className="gallery__heading">Reel faces</h2>
      <p className="gallery__note">
        A proposed set, drawn from this building rather than from a fruit machine, beside what the
        machine shows today. Nothing here is wired to the game — the mockup imports the current
        faces to compare against and defines its own.
      </p>

      <p className="gallery__label">On the machine now</p>
      <div className="mock__row">
        {CURRENT.map((face) => (
          <figure className="mock__cell" key={`now-${face}`}>
            <svg className="mock__face" viewBox="0 0 60 60" role="img" aria-label={face}>
              <ReelFace face={face} />
            </svg>
            <figcaption className="mock__caption">{face}</figcaption>
          </figure>
        ))}
      </div>

      <p className="gallery__label">
        Proposed — and each with its own win, because seven of the same pulse says nothing about
        what landed
      </p>
      <div className="mock__row">
        {PROPOSED.map((face) => (
          <figure className="mock__cell" key={`new-${face}`}>
            <Face face={face} won={won} />
            <figcaption className="mock__caption">{LABEL[face]}</figcaption>
          </figure>
        ))}
      </div>

      <button
        type="button"
        className={`btn btn--small${won ? "" : " btn--ghost"}`}
        onClick={() => setWon((on) => !on)}
      >
        {won ? "Stop the wins" : "Play the win animations"}
      </button>

      <p className="gallery__note">
        The dice tumble, the spade turns to catch the light, a chip is paid onto the stack, the
        ember flares, the glass rattles, the tube flickers up to full, and the bonus pops out and
        grows — which is the one that has to be unmistakable, because it is the face a player is
        hunting for.
      </p>
    </section>
  );
}
