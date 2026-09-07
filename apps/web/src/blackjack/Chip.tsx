import { useId } from "react";

/**
 * A poker chip.
 *
 * Drawn rather than styled: a chip is a shape with things set into it, and CSS
 * borders can only ever suggest that. One inline SVG has no image to fetch, no
 * resolution to be wrong at, and re-tints from the same values everything else
 * uses.
 *
 * The pale centre is the point of this design. A denomination printed straight
 * onto a coloured body has to fight that colour for contrast at every value;
 * an inlay gives the number a ground of its own, which is the only reason it
 * still reads at the forty-six pixels these are actually drawn at.
 */

/** How one denomination is painted. Shared with the stack, so a hundred is
 *  the same hundred whether it is in your hand or on the felt. */
export interface Face {
  /** The clay. */
  body: string;
  /** The spots in the rim and the inlay, which are the same colour on a chip. */
  trim: string;
  /** How many spots. A real house varies these so a stack can be counted. */
  spots: number;
}

/*
 * Casino convention where it has one, and a house's own choice where it does
 * not — two-fifty is not a chip anybody mints, so it takes the rose a real
 * table would give it.
 */
export const FACES: Record<number, Face> = {
  100: { body: "#2b3038", trim: "#eceff3", spots: 8 },
  250: { body: "#8e3358", trim: "#f6d7e4", spots: 6 },
  500: { body: "#4b3277", trim: "#e2d6f7", spots: 4 },
  1000: { body: "#a8791c", trim: "#fbecc6", spots: 3 },
};

/** Anything the house has not minted a colour for still gets a chip. */
export const PLAIN: Face = { body: "#3b4250", trim: "#e6ebf2", spots: 6 };

/** A point on a circle, with zero at the top rather than at three o'clock. */
function around(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(radians), 50 + radius * Math.sin(radians)];
}

/** The spots set evenly into the rim, drawn as arcs of a thick stroke. */
function rimSpots(count: number): string[] {
  const paths: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const centre = (360 / count) * index;
    const [ax, ay] = around(43, centre - 9);
    const [bx, by] = around(43, centre + 9);
    paths.push(`M ${ax} ${ay} A 43 43 0 0 1 ${bx} ${by}`);
  }
  return paths;
}

export function Chip({ amount, size = 46 }: { amount: number; size?: number }) {
  /*
   * A gradient needs an id, and an id has to be unique in the document — there
   * are four of these on screen at once and more once a hand is in play.
   */
  const gradient = useId();
  const face = FACES[amount] ?? PLAIN;
  const label = amount.toLocaleString("en-US");
  // The number sizes to its own length: "1,000" cannot wear "100"'s size.
  const type = label.length > 3 ? 17 : 24;

  return (
    <svg
      className="chip"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${label} chips`}
    >
      <defs>
        {/* Lit from above, the way anything lying on a table is. */}
        <radialGradient id={gradient} cx="50%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="48" fill={face.body} />
      {rimSpots(face.spots).map((path) => (
        <path key={path} d={path} stroke={face.trim} strokeWidth="11" fill="none" />
      ))}
      <circle cx="50" cy="50" r="33" fill={face.trim} />
      <circle cx="50" cy="50" r="33" fill="none" stroke="rgb(0 0 0 / 0.35)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="28" fill="none" stroke={face.body} strokeWidth="1" opacity="0.4" />
      <circle cx="50" cy="50" r="48" fill={`url(#${gradient})`} />

      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="IBM Plex Mono, ui-monospace, monospace"
        fontWeight="600"
        fontSize={type}
        fill={face.body}
      >
        {label}
      </text>
    </svg>
  );
}
