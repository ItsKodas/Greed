import type { Face } from "@backroom/game-slots";

/**
 * What is painted on the reels.
 *
 * Drawn as geometry rather than set as text, for the same reason the deck is:
 * a glyph is only as good as the font that happens to have loaded, and a
 * machine whose sevens turn into a fallback face on somebody's phone is a
 * machine that looks broken. This way one face is one shape at every size.
 *
 * Everything sits in the same 60-unit box, centred, so a reel is one grid and
 * nothing has to be nudged into place. Sixty rather than the deck's hundred
 * because five reels across a 375px cabinet leaves each one about 59px, and a
 * face drawn to a grid it does not fit is a face that gets scaled by eye.
 *
 * Each face is one object seen face-on, lit from the top left. Not one drawn
 * in perspective: a die with a top and a side, or a gem built out of a dozen
 * shaded planes, reads as a render of a thing rather than as a symbol of it,
 * and at 59px the extra geometry is mud.
 *
 * Every silhouette is different, which is what actually does the work at that
 * size: a trapezoid, a diagonal, a pair of squares, a pip, a pointed gem, a
 * numeral.
 */

/** The box every face is drawn inside. */
export const FACE_SIZE = 60;

/** The gem, kept in one place: the shine is a bar slid across behind it. */
const GEM = "M-9 -14 L9 -14 L18 -4 L0 19 L-18 -4 Z";

/**
 * The shading, mounted once by the cabinet.
 *
 * Ids are prefixed rather than named for what they are: a page holding two of
 * these — the machine and the style gallery's mockup of it — would otherwise
 * have two `#glass`, and the second one silently wins for both.
 */
export function FaceDefs() {
  return (
    <svg className="reel__defs" aria-hidden="true" focusable="false">
      <title>Shading</title>
      <defs>
        <linearGradient id="sf-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dff1f6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#8fb7c4" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="sf-whisky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8a13c" />
          <stop offset="100%" stopColor="#a55c11" />
        </linearGradient>
        <linearGradient id="sf-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8d6237" />
          <stop offset="100%" stopColor="#4e3319" />
        </linearGradient>
        <linearGradient id="sf-spade" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#a9c8ee" />
          <stop offset="55%" stopColor="#7fa8d8" />
          <stop offset="100%" stopColor="#4e77a8" />
        </linearGradient>
        <linearGradient id="sf-gem" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#eafbff" />
          <stop offset="45%" stopColor="#8fd4ea" />
          <stop offset="100%" stopColor="#3f8fb4" />
        </linearGradient>
        <linearGradient id="sf-neon" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="var(--gr-color-neon-core, #ffe8f7)" />
          <stop offset="55%" stopColor="var(--gr-color-neon-hi, #ff86d4)" />
          <stop offset="100%" stopColor="var(--gr-color-neon, #c9439e)" />
        </linearGradient>
        <radialGradient id="sf-ground" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#000" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sf-ember" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff1c4" />
          <stop offset="45%" stopColor="#ff8a2b" />
          <stop offset="100%" stopColor="#b52d05" stopOpacity="0" />
        </radialGradient>
        {/*
         * The stone, so a shine can be slid across it without escaping it.
         * Untranslated: a clip is resolved in the user space of whatever it is
         * applied to, and the thing it clips already sits inside the group
         * that centres every face.
         */}
        <clipPath id="sf-gem-clip">
          <path d={GEM} />
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
  return <ellipse cx="0" cy={cy} rx={rx} ry="4.5" fill="url(#sf-ground)" />;
}

/*
 * Each face is split into the part that holds still and the part its win moves.
 * The moving part carries a class the stylesheet drives, so the drawing and the
 * animation stay in one place each — and a face that wins says something about
 * itself rather than pulsing like every other one.
 */
const DRAWN: Record<Face, { title: string; art: React.ReactNode }> = {
  tumbler: {
    title: "Tumbler",
    art: (
      <>
        <Ground rx={15} cy={20} />
        {/*
         * The whole glass moves, not the drink inside it. Rocking only the
         * pour tipped the liquid straight out through the side of the glass,
         * which is a good deal more than a win is worth.
         */}
        <g className="sf-move sf-move--tumbler">
          <path d="M-11 -1 H11 L9.5 15 H-9.5 Z" fill="url(#sf-whisky)" />
          <rect x="-5" y="1" width="7" height="7" rx="1.6" fill="#fff" opacity="0.28" />
          <path
            d="M-13 -14 H13 L10 16 H-10 Z"
            fill="url(#sf-glass)"
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
  },
  cigar: {
    title: "Cigar",
    art: (
      <>
        <Ground rx={17} />
        {/*
         * The lean is on the outer group and the rock on the inner one: a CSS
         * transform replaces the SVG attribute outright rather than composing
         * with it, so a rock written onto this group would drop the lean and
         * lay the cigar flat the moment it won.
         */}
        <g transform="rotate(-24)">
          <g className="sf-move sf-move--cigar">
            <rect x="-20" y="-6" width="34" height="12" rx="5" fill="url(#sf-leaf)" />
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
            <g className="sf-ember">
              <circle cx="17" cy="0" r="7" fill="url(#sf-ember)" />
              <circle cx="15" cy="0" r="3.4" fill="#ffb347" />
            </g>
          </g>
        </g>
      </>
    ),
  },
  dice: {
    title: "Dice",
    art: (
      <>
        <Ground rx={19} cy={21} />
        {/*
         * Two, overlapping, and showing different faces — which is the whole
         * reason for two: a pair reads as dice at a glance where one square
         * reads as a square. Each sits in its own pair of groups, the outer
         * one placing it and the inner one giving it its tilt, so the win
         * between them has a clean origin and an untilted direction to fly in.
         */}
        <g transform="translate(-6 -4)">
          <g className="sf-die sf-die--back">
            <g transform="rotate(-13)">
              <Die
                pips={[
                  [-1, -1],
                  [0, 0],
                  [1, 1],
                ]}
              />
            </g>
          </g>
        </g>
        <g transform="translate(6 4)">
          <g className="sf-die sf-die--front">
            <g transform="rotate(9)">
              <Die
                pips={[
                  [-1, -1],
                  [1, -1],
                  [0, 0],
                  [-1, 1],
                  [1, 1],
                ]}
              />
            </g>
          </g>
        </g>
      </>
    ),
  },
  spade: {
    title: "Spade",
    art: (
      <>
        <Ground rx={16} />
        <g className="sf-move sf-move--spade">
          <path
            transform="scale(1.32)"
            d="M0 -13 C 8 -5, 14 -2, 14 2 C 14 6, 10 8, 6 8 C 3 8, 1 7, 0 5 C -1 7, -3 8, -6 8 C -10 8, -14 6, -14 2 C -14 -2, -8 -5, 0 -13 Z M-1 5 C -2 8, -4 10, -6 11 L 6 11 C 4 10, 2 8, 1 5 Z"
            fill="url(#sf-spade)"
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
  },
  diamond: {
    title: "Diamond",
    art: (
      <>
        <Ground rx={15} cy={22} />
        {/*
         * One stone with its cut drawn on, rather than a dozen shaded planes:
         * the girdle and two pavilion lines are the whole of it. Which leaves
         * the win somewhere to happen — the stone swells while the light
         * travels across it, and the light is clipped to the stone's outline.
         *
         * The shine rides inside the swelling group rather than beside it. A
         * clip is resolved before an ancestor's transform, so the two scale
         * together and the light keeps its edges on the stone.
         */}
        <g className="sf-gem">
          <path d={GEM} fill="url(#sf-gem)" />
          <path d="M-9 -14 L-18 -4 L-4 -4 L0 19 Z" fill="#fff" opacity="0.26" />
          <path
            d="M-18 -4 H18 M-6 -4 L0 19 M6 -4 L0 19"
            stroke="#fff"
            strokeOpacity="0.4"
            strokeWidth="1.6"
          />
          <g clipPath="url(#sf-gem-clip)">
            <rect className="sf-shine" x="-34" y="-40" width="9" height="80" fill="#fff" />
          </g>
        </g>
      </>
    ),
  },
  seven: {
    title: "Seven",
    art: (
      <>
        <Ground rx={14} />
        <g className="sf-move sf-move--seven">
          <path d="M-11 -16 L11 -16 L11 -10 L2 16 L-5 16 L4 -10 L-11 -10 Z" fill="url(#sf-neon)" />
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
  },
};

/**
 * One face, centred in its box.
 *
 * An unknown face draws nothing rather than throwing. What arrives here comes
 * off the wire, and a blank cell is a bad afternoon where a blank page is a
 * broken machine — a test in games/slots keeps the two lists in step so this
 * should never happen, and this is what happens if it does anyway.
 */
export function ReelFace({ face }: { face: Face }) {
  const drawn = DRAWN[face];
  if (drawn === undefined) {
    return null;
  }
  return (
    <g data-face={face} transform={`translate(${FACE_SIZE / 2} ${FACE_SIZE / 2})`}>
      <title>{drawn.title}</title>
      {drawn.art}
    </g>
  );
}
