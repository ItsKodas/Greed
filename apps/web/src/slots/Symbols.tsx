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
 */

/** The box every face is drawn inside. */
export const FACE_SIZE = 60;

/**
 * The colours, which are mostly the face's own rather than the room's.
 *
 * A slot machine is read at a glance and largely by colour, so these have to
 * stay apart from one another whatever room the cabinet is standing in. The
 * seven is the exception: it is the jackpot, so it burns in the room's own
 * tube and moves when the room is repainted.
 */
const INK = {
  chip: "#e0b048",
  dice: "#eef1f6",
  spade: "#7fa8d8",
  horseshoe: "#c8722f",
  bell: "#f4d97a",
  dark: "#160e1c",
  /* The inlay on a chip's rim, which is lighter than the chip and never darker. */
  inlay: "#f7ecd6",
} as const;

const DRAWN: Record<Face, { title: string; art: React.ReactNode }> = {
  chip: {
    title: "Chip",
    art: (
      <>
        <circle cx="0" cy="0" r="19" fill={INK.chip} />
        {/*
         * Six edge inlays, lighter than the chip and set *inside* the rim.
         * Dark spots centred on the edge — where a stroke puts half its width
         * outside the disc — read as teeth, and the chip reads as a cog.
         */}
        <circle
          cx="0"
          cy="0"
          r="15"
          fill="none"
          stroke={INK.inlay}
          strokeWidth="7"
          strokeDasharray="8 7.7"
        />
        <circle cx="0" cy="0" r="8" fill="none" stroke={INK.dark} strokeWidth="1.8" opacity="0.5" />
        <circle cx="0" cy="0" r="4" fill={INK.dark} opacity="0.28" />
      </>
    ),
  },
  dice: {
    title: "Dice",
    art: (
      <>
        <rect x="-17" y="-17" width="34" height="34" rx="7" fill={INK.dice} />
        {[
          [-8, -8],
          [8, -8],
          [0, 0],
          [-8, 8],
          [8, 8],
        ].map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="3.2" fill={INK.dark} />
        ))}
      </>
    ),
  },
  spade: {
    title: "Spade",
    art: (
      <path
        transform="scale(1.32)"
        d="M0 -13 C 8 -5, 14 -2, 14 2 C 14 6, 10 8, 6 8 C 3 8, 1 7, 0 5 C -1 7, -3 8, -6 8 C -10 8, -14 6, -14 2 C -14 -2, -8 -5, 0 -13 Z M-1 5 C -2 8, -4 10, -6 11 L 6 11 C 4 10, 2 8, 1 5 Z"
        fill={INK.spade}
      />
    ),
  },
  horseshoe: {
    title: "Horseshoe",
    art: (
      <>
        <path
          d="M-15 15 L-15 -1 A 15 15 0 0 1 15 -1 L 15 15 L 7 15 L 7 -1 A 7 7 0 0 0 -7 -1 L -7 15 Z"
          fill={INK.horseshoe}
        />
        {/* The nail holes, which are most of what makes it read as a shoe. */}
        {[
          [-11, 4],
          [11, 4],
          [-11, 11],
          [11, 11],
        ].map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="1.8" fill={INK.dark} opacity="0.55" />
        ))}
      </>
    ),
  },
  bell: {
    title: "Bell",
    art: (
      <>
        <path
          d="M0 -17 C 8 -17, 12 -10, 12 -3 C 12 5, 15 9, 16 11 L -16 11 C -15 9, -12 5, -12 -3 C -12 -10, -8 -17, 0 -17 Z"
          fill={INK.bell}
        />
        <circle cx="0" cy="15" r="3.5" fill={INK.bell} />
        <circle cx="-5" cy="-8" r="3" fill="#ffffff" opacity="0.4" />
      </>
    ),
  },
  seven: {
    title: "Seven",
    art: (
      <>
        <path
          d="M-11 -16 L11 -16 L11 -10 L2 16 L-5 16 L4 -10 L-11 -10 Z"
          fill="var(--gr-color-neon-hi)"
        />
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
