import { useId } from "react";
import { ChipFace, LADDER, Lift } from "./Chip.js";
import { chipsFor } from "./ChipStack.js";

/**
 * A balance, laid out the way a dealer racks one.
 *
 * The pile beside a hand answers "how much is riding on this". This answers
 * "how much have you got", which is a different question and wants a different
 * shape: one short column per denomination, side by side, so a large number
 * spreads sideways instead of growing into a tower nothing can contain.
 *
 * Counted on the full ladder rather than on what the tray holds. A balance of
 * forty thousand is eight plates and not forty chips, and nobody racks forty
 * chips of the same colour to say so.
 */

/** How tall one column gets before another is started beside it. */
const TALLEST = 5;
/** How much of each chip the one above it leaves showing. */
const SHOW = 0.34;
/** Past this the tray stops being a count and starts being wallpaper. */
const WIDEST = 7;

interface Column {
  value: number;
  count: number;
}

/**
 * The chips of a balance, broken into columns.
 *
 * Grouped by denomination first, then split so no column runs past a height
 * anybody could count at a glance — which is exactly why a real rack is a row
 * of short columns rather than one tall one.
 */
export function columnsFor(amount: number): Column[] {
  const chips = chipsFor(amount, LADDER);
  const columns: Column[] = [];

  for (const value of chips) {
    const open = columns.at(-1);
    if (open !== undefined && open.value === value && open.count < TALLEST) {
      open.count += 1;
      continue;
    }
    columns.push({ value, count: 1 });
  }

  return columns;
}

export function ChipColumns({ amount, unit = 34 }: { amount: number; unit?: number }) {
  const lift = useId();
  const all = columnsFor(amount);
  if (all.length === 0) {
    return null;
  }

  /*
   * The widest columns are kept, not the first ones. They are already in
   * descending order of value, so trimming the tail drops the small change —
   * which is the right thing to lose when there is not room for everything.
   */
  const shown = all.slice(0, WIDEST);
  const dropped = all.length - shown.length;

  const r = 48;
  const step = r * 2 * SHOW;
  const gap = r * 0.5;
  const tallest = Math.max(...shown.map((column) => column.count));
  const height = (tallest - 1) * step + r * 2 + 2;
  const width = shown.length * (r * 2) + (shown.length - 1) * gap + 2;
  const bottom = height - r - 1;

  return (
    <svg
      className="rack"
      viewBox={`0 0 ${width} ${height}`}
      width={(width / (r * 2 + 2)) * unit}
      height={(height / (r * 2 + 2)) * unit}
      role="img"
      aria-label={`${amount.toLocaleString("en-US")} chips`}
    >
      <defs>
        <Lift id={lift} />
      </defs>
      {shown.map((column, index) => {
        const cx = r + 1 + index * (r * 2 + gap);
        return (
          // Position is the identity: columns are built left to right and two
          // columns of the same denomination are the same thing twice.
          // biome-ignore lint/suspicious/noArrayIndexKey: columns are append-only
          <g key={index}>
            {Array.from({ length: column.count }, (_, height_) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a column is append-only
              <g key={height_}>
                <ChipFace
                  cx={cx}
                  cy={bottom - height_ * step}
                  r={r}
                  amount={column.value}
                  showValue={height_ === column.count - 1}
                  lift={lift}
                />
              </g>
            ))}
          </g>
        );
      })}
      {dropped > 0 ? (
        <text
          x={width - 4}
          y={height - 6}
          textAnchor="end"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
          fontSize="20"
          fill="currentColor"
          opacity="0.75"
        >
          +{dropped}
        </text>
      ) : null}
    </svg>
  );
}
