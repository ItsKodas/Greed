import { useState } from "react";
import { FACES } from "@backroom/game-slots";
import { ReelFace } from "../slots/Symbols.js";

/**
 * Proposed reel faces, next to the ones on the machine now.
 *
 * A mockup and nothing else: the machine imports none of this, so nothing here
 * can change what anybody is playing. It is here to be argued with.
 *
 * The set on the right is drawn from this building rather than from a fruit
 * machine — a tumbler, a cigar, a thrown pair of dice, a spade, a cut stone,
 * the neon seven that was already the best of the old lot, and a star for the
 * bonus. Every silhouette is different, which is what actually does the work
 * at 57px on a phone: a trapezoid, a diagonal, a pair of squares, a pip, a
 * pointed gem, a numeral, a burst.
 *
 * Each face is one object seen face-on, lit from the top left. Not one drawn
 * in perspective: a die with a top and a side, or a gem built out of a dozen
 * shaded planes, reads as a render of a thing rather than as a symbol of it,
 * and at 57px the extra geometry is mud.
 *
 * Each one also carries its own win animation, and each says something about
 * the object rather than being the same pulse seven times: the dice fly
 * apart, the stone takes the light, the ember flares.
 */

/** Every proposed face, cheapest first, the way a paytable reads. */
export const PROPOSED = [
  "tumbler",
  "cigar",
  "dice",
  "spade",
  "diamond",
  "seven",
  "bonus",
] as const;

export type Proposed = (typeof PROPOSED)[number];

const LABEL: Record<Proposed, string> = {
  tumbler: "Tumbler",
  cigar: "Cigar",
  dice: "Dice",
  spade: "Spade",
  diamond: "Diamond",
  seven: "Seven",
  bonus: "Bonus",
};

/**
 * What the machine shows now — read from the game rather than listed here, so
 * this comparison cannot quietly go stale once the proposal is adopted.
 */
export const CURRENT = FACES;

/** The gem, kept in one place: the shine is a bar slid across behind it. */
const GEM = "M-9 -14 L9 -14 L18 -4 L0 19 L-18 -4 Z";

/** The star, likewise, because its shimmer is clipped to its own outline. */
const STAR = "M0 -19 L5.6 -6.2 L19.5 -4.7 L9.2 4.8 L12 18.4 L0 11.6 L-12 18.4 L-9.2 4.8 L-19.5 -4.7 L-5.6 -6.2 Z";

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
        <linearGradient id="mk-spade" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#a9c8ee" />
          <stop offset="55%" stopColor="#7fa8d8" />
          <stop offset="100%" stopColor="#4e77a8" />
        </linearGradient>
        <linearGradient id="mk-gem" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#eafbff" />
          <stop offset="45%" stopColor="#8fd4ea" />
          <stop offset="100%" stopColor="#3f8fb4" />
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
        {/*
          * The stone, so a shine can be slid across it without escaping it.
          * Untranslated: a clip is resolved in the user space of whatever it
          * is applied to, and the thing it clips already sits inside the
          * group that centres every face.
          */}
        <clipPath id="mk-gem-clip">
          <path d={GEM} />
        </clipPath>
        <clipPath id="mk-star-clip">
          <path d={STAR} />
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * One die, face-on.
 *
 * `pips` are in corner units — -1, 0 or 1 on each axis — so a face is written
 * as the pattern it looks like rather than as five pairs of coordinates. The
 * outline is what lets two of these overlap and still read as two.
 */
function Die({ pips }: { pips: [number, number][] }) {
  const HALF = 11;
  return (
    <>
      <rect
        x={-HALF}
        y={-HALF}
        width={HALF * 2}
        height={HALF * 2}
        rx="3.6"
        fill="#eef1f6"
        stroke="#141a22"
        strokeWidth="2"
      />
      {pips.map(([px, py]) => (
        <circle key={`${px},${py}`} cx={px * 5.6} cy={py * 5.6} r="2.1" fill="#1b2028" />
      ))}
    </>
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
      {/*
       * The lean is on the outer group and the rock on the inner one: a CSS
       * transform replaces the SVG attribute outright rather than composing
       * with it, so a rock written onto this group would drop the lean and lay
       * the cigar flat the moment it won.
       */}
      <g transform="rotate(-24)">
        <g className="mk-move mk-move--cigar">
          <rect x="-20" y="-6" width="34" height="12" rx="5" fill="url(#mk-leaf)" />
          {/* The band, because a cigar without one is a brown rectangle. */}
          <rect x="0" y="-6" width="7" height="12" fill="#c8a03c" />
          <path
            d="M-20 -3 H10"
            stroke="#fff"
            strokeOpacity="0.16"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* A coal catching, not a firework: it barely swells. */}
          <g className="mk-ember">
            <circle cx="17" cy="0" r="7" fill="url(#mk-ember)" />
            <circle cx="15" cy="0" r="3.4" fill="#ffb347" />
          </g>
        </g>
      </g>
    </>
  ),
  dice: (
    <>
      <Ground rx={19} cy={21} />
      {/*
       * Two, overlapping, and showing different faces — which is the whole
       * reason for two: a pair reads as dice at a glance where one square
       * reads as a square. Each sits in its own pair of groups, the outer one
       * placing it and the inner one giving it its tilt, so the animation
       * between them has a clean origin and an untilted direction to fly in.
       */}
      <g transform="translate(-6 -4)">
        <g className="mk-die mk-die--back">
          <g transform="rotate(-13)">
            <Die pips={[[-1, -1], [0, 0], [1, 1]]} />
          </g>
        </g>
      </g>
      <g transform="translate(6 4)">
        <g className="mk-die mk-die--front">
          <g transform="rotate(9)">
            <Die pips={[[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]} />
          </g>
        </g>
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
  diamond: (
    <>
      <Ground rx={15} cy={22} />
      {/*
       * One stone with its cut drawn on, rather than a dozen shaded planes:
       * the girdle and two pavilion lines are the whole of it. Which leaves
       * the win somewhere to happen — the stone swells while the light travels
       * across it, and the light is clipped to the stone's own outline.
       *
       * The shine rides inside the swelling group rather than beside it. A
       * clip is resolved before an ancestor's transform, so the two scale
       * together and the light keeps its edges on the stone.
       */}
      <g className="mk-move--diamond">
        <path d={GEM} fill="url(#mk-gem)" />
        <path d="M-9 -14 L-18 -4 L-4 -4 L0 19 Z" fill="#fff" opacity="0.26" />
        <path
          d="M-18 -4 H18 M-6 -4 L0 19 M6 -4 L0 19"
          stroke="#fff"
          strokeOpacity="0.4"
          strokeWidth="1.6"
        />
        <g clipPath="url(#mk-gem-clip)">
          <rect className="mk-shine" x="-34" y="-40" width="9" height="80" fill="#fff" />
        </g>
      </g>
    </>
  ),
  seven: (
    <>
      <Ground rx={14} />
      <g className="mk-move mk-move--seven">
        <path d="M-11 -16 L11 -16 L11 -10 L2 16 L-5 16 L4 -10 L-11 -10 Z" fill="url(#mk-neon)" />
        <path
          d="M-9 -14 L9 -14"
          stroke="#fff"
          strokeOpacity="0.65"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    </>
  ),
  bonus: (
    <>
      <Ground rx={18} />
      <g className="mk-move--bonus">
        <path
          d={STAR}
          fill="url(#mk-star)"
          stroke="#8a5200"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M0 -14 L3.6 -5.4 L-3.6 -5.4 Z" fill="#fff" opacity="0.45" />
        <g clipPath="url(#mk-star-clip)">
          <rect className="mk-star-shine" x="-36" y="-40" width="11" height="80" fill="#fffbe8" />
        </g>
        <g transform="translate(13 -12) scale(1.0)">
          <path className="mk-spark" d="M0 -6.5 L1.5 -1.5 L6.5 0 L1.5 1.5 L0 6.5 L-1.5 1.5 L-6.5 0 L-1.5 -1.5 Z" fill="#fff8dc" />
        </g>
        <g transform="translate(-14 7) scale(0.78)">
          <path className="mk-spark" d="M0 -6.5 L1.5 -1.5 L6.5 0 L1.5 1.5 L0 6.5 L-1.5 1.5 L-6.5 0 L-1.5 -1.5 Z" fill="#fff8dc" />
        </g>
        <g transform="translate(4 16) scale(0.62)">
          <path className="mk-spark" d="M0 -6.5 L1.5 -1.5 L6.5 0 L1.5 1.5 L0 6.5 L-1.5 1.5 L-6.5 0 L-1.5 -1.5 Z" fill="#fff8dc" />
        </g>
        <g transform="translate(-8 -14) scale(0.55)">
          <path className="mk-spark" d="M0 -6.5 L1.5 -1.5 L6.5 0 L1.5 1.5 L0 6.5 L-1.5 1.5 L-6.5 0 L-1.5 -1.5 Z" fill="#fff8dc" />
        </g>
      </g>
    </>
  ),
};

function Face({ face, won, big = false }: { face: Proposed; won: boolean; big?: boolean }) {
  return (
    <svg
      className={`mock__face${big ? " mock__face--big" : ""}${won ? " mock__face--won" : ""}`}
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

      <p className="gallery__label">Large enough to argue with</p>
      <div className="mock__row">
        {PROPOSED.map((face) => (
          <figure className="mock__cell" key={`big-${face}`}>
            <Face face={face} won={won} big={true} />
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
        The dice fly apart and come back together, the stone swells as the light crosses it, the cigar rocks
        while its ember breathes, the spade turns to catch it, the glass rattles, the tube flickers
        up to full, and the bonus pops out and grows — which is the one that has to be unmistakable,
        because it is the face a player is hunting for.
      </p>
    </section>
  );
}
