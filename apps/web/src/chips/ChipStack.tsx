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

/** Past this a pile stops being worth drawing and starts being a number. */
const MOST = 20;

/** Past this a stack stops being a stack and starts being a tower. */
const TALLEST = 5;

/** How much of each chip the one above it leaves showing, as a fraction. */
const SHOW = 0.34;

/** How far apart neighbouring stacks sit, as a fraction of a chip's width. */
const APART = 0.9;

/**
 * A heap of chips arranged into stacks, the way somebody would actually leave
 * them.
 *
 * Nobody builds one column of twenty. Past about five it stops standing up and
 * stops being countable at a glance, which are the two things a stack is for —
 * so it goes sideways instead, into as few stacks as will hold it, levelled so
 * no stack is left holding a single chip beside a full one.
 *
 * Fills largest first, so a stack is of a kind rather than a mixture. That is
 * both how people sort them and what makes the heap readable by colour.
 */
export function pileUp(chips: readonly number[], tallest = TALLEST): number[][] {
  const stacks = Math.max(1, Math.ceil(chips.length / tallest));
  const base = Math.floor(chips.length / stacks);
  const spare = chips.length % stacks;

  const out: number[][] = [];
  let at = 0;
  for (let index = 0; index < stacks; index += 1) {
    const take = base + (index < spare ? 1 : 0);
    out.push(chips.slice(at, at + take));
    at += take;
  }
  return out;
}

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

export function ChipStack({
  amount,
  width = 40,
  ladder,
  most = MOST,
  tallest = TALLEST,
}: {
  amount: number;
  width?: number;
  /**
   * How many chips to draw before the rest become a count.
   *
   * Somewhere with a fixed amount of room — a pot beside its own figure, which
   * can be any size at all — needs to say a smaller number than the default,
   * or the heap grows past whatever it was drawn to sit in.
   */
  most?: number;
  /** How tall one stack may get before the heap goes sideways instead. */
  tallest?: number;
  /**
   * What to count in. The betting tray's plates by default, which is right for
   * a stake somebody pushed out with the chip buttons — but a game whose
   * numbers do not divide into those has to say so, or every pile it draws
   * ends in an odd chip that stands for a remainder rather than for money.
   */
  ladder?: readonly number[];
}) {
  const lift = useId();
  const all = ladder === undefined ? chipsFor(amount) : chipsFor(amount, ladder);
  if (all.length === 0) {
    return null;
  }

  const shown = all.slice(0, Math.max(1, most));
  const hidden = all.length - shown.length;

  /*
   * The box has to hold the whole drawing. Chips are laid bottom upwards, so
   * the lowest ink is the bottom chip's rim and the highest is the top chip's
   * — measured from the centres rather than guessed at, which is how an
   * earlier version came to cut its own bottom chip in half. The same applies
   * across now that a heap has more than one stack in it.
   */
  const r = 48;
  const step = r * 2 * SHOW;
  const across = r * 2 * APART;
  const stacks = pileUp(shown, tallest);
  const deepest = Math.max(...stacks.map((stack) => stack.length));
  const boxW = (stacks.length - 1) * across + r * 2 + 2;
  const boxH = (deepest - 1) * step + r * 2 + 2;
  const bottom = boxH - r - 1;
  /*
   * Pixels per unit, taken from one chip rather than from the whole box, so a
   * chip is `width` across whether it is standing on its own or is one of a
   * dozen. Sizing the box instead shrank every chip as the heap grew, which
   * read as the money getting further away the more of it there was.
   */
  const scale = width / (r * 2 + 2);

  return (
    <svg
      className="stack"
      viewBox={`0 0 ${boxW} ${boxH}`}
      width={boxW * scale}
      height={boxH * scale}
      role="img"
      aria-label={`${amount.toLocaleString("en-US")} in chips`}
    >
      <defs>
        <Lift id={lift} />
      </defs>
      {stacks.map((stack, column) =>
        stack.map((value, index) => {
          /*
           * How many chips are already down, counting across the heap. The
           * stagger runs over the whole thing rather than restarting at each
           * stack, so a heap lands as one heap instead of as three piles
           * dealing themselves at once.
           */
          const laid = stacks.slice(0, column).reduce((sum, one) => sum + one.length, 0) + index;
          return (
            <g
              // Position is the identity: a stack is built bottom upwards and
              // two chips of the same value are genuinely the same thing.
              // biome-ignore lint/suspicious/noArrayIndexKey: a heap is append-only
              key={`${column}:${index}`}
              className="stack__chip"
              /* Capped, because a chip added to a heap of nine should land now
                 and not after half a second of waiting its turn. */
              style={{ animationDelay: `${Math.min(laid, 3) * 45}ms` }}
            >
              <ChipFace
                cx={r + 1 + column * across}
                cy={bottom - index * step}
                r={r}
                amount={value}
                // Only the top of a stack is fully visible, so only the top is
                // worth a number — lower down it would be a crescent of a digit.
                showValue={index === stack.length - 1}
                lift={lift}
              />
            </g>
          );
        }),
      )}
      {hidden > 0 ? (
        <text
          x={boxW / 2}
          y={bottom - (deepest - 1) * step - r - 4}
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
