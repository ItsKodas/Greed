import { useId } from "react";
import { ChipFace, Lift, MINTED } from "./Chip.js";

/**
 * A wager, as chips rather than as a number.
 *
 * A figure tells you the amount; a pile tells you the weight of it, which is
 * what anybody actually reads across a table. Two chips in front of somebody
 * and nine in front of somebody else says something before either number has
 * been read.
 *
 * Drawn head-on and overlapping rather than side-on. A true side view is more
 * honest about what a stack is and puts almost all of its detail into two or
 * three pixels of edge; overlapping the faces keeps every chip showing a
 * crescent of its own rim, so the pile is read the same way the tray is — by
 * colour, straight down.
 */

/** Past this the pile stops being countable and starts being a column. */
const MOST = 12;

/** How much of each chip the one above it leaves showing, as a fraction. */
const SHOW = 0.34;

/**
 * The chips a wager is made of.
 *
 * Greedy, largest first, which is how anybody actually counts out a stake. A
 * remainder can only turn up if something staked an amount the house has no
 * chip for; it becomes one odd chip rather than disappearing, because a pile
 * that does not add up to the number beside it is worse than an odd chip.
 *
 * @param ladder Which denominations to count in. The betting tray holds four;
 * counting a balance uses the larger plates as well.
 */
export function chipsFor(amount: number, ladder: readonly number[] = MINTED): number[] {
  const chips: number[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const value of ladder) {
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

export function ChipStack({ amount, width = 40 }: { amount: number; width?: number }) {
  const lift = useId();
  const all = chipsFor(amount);
  if (all.length === 0) {
    return null;
  }

  const shown = all.slice(0, MOST);
  const hidden = all.length - shown.length;

  /*
   * The box has to hold the whole drawing. Chips are laid bottom upwards, so
   * the lowest ink is the bottom chip's rim and the highest is the top chip's
   * — measured from the centres rather than guessed at, which is how the last
   * version came to cut its own bottom chip in half.
   */
  const r = 48;
  const step = r * 2 * SHOW;
  const height = (shown.length - 1) * step + r * 2 + 2;
  const bottom = height - r - 1;

  return (
    <svg
      className="stack"
      viewBox={`0 0 ${r * 2 + 2} ${height}`}
      width={width}
      height={(width / (r * 2 + 2)) * height}
      role="img"
      aria-label={`${amount.toLocaleString("en-US")} in chips`}
    >
      <defs>
        <Lift id={lift} />
      </defs>
      {shown.map((value, index) => (
        // Position is the identity: a pile is built bottom upwards and two
        // chips of the same value are genuinely the same thing.
        <g
          // biome-ignore lint/suspicious/noArrayIndexKey: a pile is append-only
          key={index}
          className="stack__chip"
          /* Staggered, so a pile lands as a pile rather than as one object.
             Capped, because a chip added to a stack of nine should land now
             and not after half a second of waiting its turn. */
          style={{ animationDelay: `${Math.min(index, 3) * 45}ms` }}
        >
          <ChipFace
            cx={r + 1}
            cy={bottom - index * step}
            r={r}
            amount={value}
            // Only the top one is fully visible, so only the top one is worth
            // a number — on the others it would be a crescent of a digit.
            showValue={index === shown.length - 1}
            lift={lift}
          />
        </g>
      ))}
      {hidden > 0 ? (
        <text
          x={r + 1}
          y={bottom - (shown.length - 1) * step - r - 4}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
          fontSize="16"
          fill="currentColor"
          opacity="0.75"
        >
          +{hidden}
        </text>
      ) : null}
    </svg>
  );
}
