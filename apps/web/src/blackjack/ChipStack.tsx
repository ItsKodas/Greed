import { FACES, PLAIN } from "./Chip.js";

/**
 * A wager, as chips rather than as a number.
 *
 * A figure tells you the amount; a stack tells you the weight of it, which is
 * the thing you actually read across a table. Somebody with two chips in front
 * of them and somebody with nine are telling you something before you have
 * read either number.
 *
 * Drawn edge-on and from below, the way a stack looks to somebody sitting at
 * the table rather than standing over it — which is also the only angle where
 * the chips underneath are still visible at all.
 */

/** What the house mints, largest first. */
const DENOMINATIONS = [1000, 500, 250, 100];

/**
 * The chips a wager is made of.
 *
 * Greedy, largest first, which is how anybody actually counts out a stake. A
 * remainder can only turn up if something staked an amount the house has no
 * chip for; it becomes one odd chip rather than disappearing, because a stack
 * that does not add up to the number beside it is worse than an odd chip.
 */
export function chipsFor(amount: number): number[] {
  const chips: number[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const value of DENOMINATIONS) {
    while (left >= value) {
      chips.push(value);
      left -= value;
    }
  }
  if (left > 0) {
    chips.push(left);
  }
  return chips;
}

/** Past this the stack stops being countable and starts being a column. */
const MOST = 12;

/*
 * The proportions of a stack seen from a chair rather than from above.
 *
 * The top ellipse is the number that matters. Drawn tall it dominates
 * everything under it and the stack reads as one striped drum; kept flat, the
 * chips below get most of the height and it reads as what it is. Each chip
 * shows a little more edge than the one above it covers, which is what makes
 * the count legible without anybody counting.
 */
const RISE = 9;
const SIDE = 9;
const TOP = 8;

export function ChipStack({ amount, width = 76 }: { amount: number; width?: number }) {
  const all = chipsFor(amount);
  if (all.length === 0) {
    return null;
  }

  // The tallest are at the bottom of a real stack, so the biggest chips are
  // drawn first and the rest pile on top of them.
  const shown = all.slice(0, MOST);
  const hidden = all.length - shown.length;

  /*
   * The box has to hold the whole drawing, and the bottom chip is the part
   * that catches you out: its lower edge is an arc that bulges a further TOP
   * below where the side ends, so a box measured to the side alone clips it.
   *
   * Top of the drawing:    base - (n - 1) * RISE - TOP
   * Bottom of the drawing: base + SIDE + TOP
   */
  const base = (shown.length - 1) * RISE + TOP + 1;
  const height = base + SIDE + TOP + 1;

  return (
    <svg
      className="stack"
      viewBox={`0 0 100 ${height}`}
      width={width}
      height={(width / 100) * height}
      role="img"
      aria-label={`${amount.toLocaleString("en-US")} in chips`}
    >
      {shown.map((value, index) => {
        const face = FACES[value] ?? PLAIN;
        const y = base - index * RISE;
        return (
          // Position is the identity: a stack is built bottom upwards and two
          // chips of the same value are genuinely the same thing.
          // biome-ignore lint/suspicious/noArrayIndexKey: a stack is append-only
          <g key={index}>
            {/* The edge, which is most of what you see of every chip but the top one. */}
            <path
              d={`M 6 ${y} L 6 ${y + SIDE} A 44 ${TOP} 0 0 0 94 ${y + SIDE} L 94 ${y} Z`}
              fill={face.body}
            />
            {/* The band round the edge, which is all you see of a chip that
                has another one sitting on it. */}
            <rect x="8" y={y + 3} width="84" height="3" fill={face.trim} opacity="0.6" />
            <ellipse
              cx="50"
              cy={y}
              rx="44"
              ry={TOP}
              fill={face.body}
              stroke={face.trim}
              strokeWidth="1.2"
              strokeOpacity="0.55"
            />
          </g>
        );
      })}
      {hidden > 0 ? (
        <text
          x="50"
          y={base - (shown.length - 1) * RISE - TOP - 4}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
          fontSize="13"
          fill="currentColor"
          opacity="0.7"
        >
          +{hidden}
        </text>
      ) : null}
    </svg>
  );
}
