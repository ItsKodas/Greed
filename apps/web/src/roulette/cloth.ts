import { SPOTS, type Spot } from "@backroom/game-roulette";

/**
 * Where every bet sits on the cloth, and what a tap lands on.
 *
 * Pure arithmetic in grid units rather than measurements off the DOM, for two
 * reasons. It can be tested without a browser, which is what lets the felt and
 * the rules be checked against each other — every anchor here must name a spot
 * the server knows, and every spot the server knows must have somewhere to go.
 * And it does not care how big the cloth is drawn: the component scales these
 * numbers to whatever space it has, so the same geometry serves a phone and a
 * desk without a second set of figures to keep in step.
 *
 * The grid is the cloth as it is really laid out: the zero in its own column,
 * then twelve columns of three, with 3 at the top and 1 at the bottom. One
 * unit is one square.
 */

/** Columns of numbers, not counting the zero's. */
export const COLUMNS = 12;
/** Rows of numbers. */
export const ROWS = 3;

/**
 * The whole cloth, in squares.
 *
 * Wider and taller than the numbers: the zero has a column to the left of
 * them, the 2-to-1 boxes have one to the right, and the dozens and the
 * even-money bets take a row each underneath. Exported so the component scales
 * to exactly this and no guessing goes on at either end.
 */
export const WIDTH = COLUMNS + 2;
export const HEIGHT = ROWS + 2;

/** How far a tap may be from a spot and still count as aimed at it, in squares. */
export const REACH = 0.55;

export interface Anchor {
  spotId: string;
  /** In squares, from the left edge of the zero's column. */
  x: number;
  /** In squares, from the top. */
  y: number;
}

/** A rectangle on the cloth, for the bets that are drawn as their own areas. */
export interface Box {
  spotId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

/**
 * Where a number's square sits.
 *
 * The zero's column is column zero, so the numbers start at one — which is why
 * every x below is one more than you would expect from the column alone.
 */
const columnOf = (n: number) => Math.ceil(n / 3);
const rowOf = (n: number) => ROWS - ((n - 1) % 3);

/** The centre of one number's square. */
function centre(n: number): { x: number; y: number } {
  if (n === 0) {
    return { x: 0.5, y: ROWS / 2 };
  }
  return { x: columnOf(n) + 0.5, y: rowOf(n) - 0.5 };
}

/** The average of several squares' centres, which is the line or corner they share. */
function between(numbers: readonly number[]): { x: number; y: number } {
  const points = numbers.map(centre);
  return {
    x: points.reduce((sum, one) => sum + one.x, 0) / points.length,
    y: points.reduce((sum, one) => sum + one.y, 0) / points.length,
  };
}

/**
 * Where the outside bets are drawn.
 *
 * Their own areas rather than points on a line, because that is what they are:
 * a chip on red goes in the box marked red. Laid out under the numbers, in the
 * two rows a real cloth uses.
 */
function outsideBoxes(): Box[] {
  const out: Box[] = [];
  const dozens = [...SPOTS.values()].filter((one) => one.kind === "dozen");
  dozens.forEach((spot, at) => {
    out.push({ spotId: spot.id, x: 1 + at * 4, y: ROWS, width: 4, height: 1, label: spot.label });
  });

  /*
   * The even-money row, in the order a cloth prints them: low, red, black,
   * odd, even, high — reading outward from the middle rather than in whatever
   * order they happen to be built.
   */
  const order = ["1-18", "Red", "Black", "Odd", "Even", "19-36"];
  const evens = [...SPOTS.values()].filter((one) => one.kind === "even");
  order.forEach((label, at) => {
    const spot = evens.find((one) => one.label === label);
    if (spot === undefined) {
      return;
    }
    out.push({ spotId: spot.id, x: 1 + at * 2, y: ROWS + 1, width: 2, height: 1, label });
  });

  // The columns sit at the far end of their own rows, as they do on a cloth.
  const columns = [...SPOTS.values()].filter((one) => one.kind === "column");
  columns.forEach((spot, at) => {
    out.push({
      spotId: spot.id,
      x: COLUMNS + 1,
      y: ROWS - 1 - at,
      width: 1,
      height: 1,
      label: "2 to 1",
    });
  });
  return out;
}

export const BOXES: readonly Box[] = outsideBoxes();

/** The box a spot is drawn as, if it is drawn as one rather than placed on a line. */
export function boxOf(spotId: string): Box | null {
  return BOXES.find((one) => one.spotId === spotId) ?? null;
}

function build(): Anchor[] {
  const out: Anchor[] = [];
  for (const spot of SPOTS.values()) {
    const box = boxOf(spot.id);
    if (box !== null) {
      out.push({ spotId: spot.id, x: box.x + box.width / 2, y: box.y + box.height / 2 });
      continue;
    }
    out.push({ spotId: spot.id, ...anchorFor(spot) });
  }
  return out;
}

function anchorFor(spot: Spot): { x: number; y: number } {
  const numbers = spot.covers;
  switch (spot.kind) {
    /*
     * A street and a six line are bet on the outer edge below their column,
     * not in the middle of the numbers — a chip in the middle would be sitting
     * on a square that already means something else.
     */
    case "street":
    case "six": {
      const point = between(numbers);
      return { x: point.x, y: ROWS };
    }
    /*
     * The zero's own bets go on its boundary with the first column, which is
     * the only edge it has. A trio and the first four both average out there
     * on their own, so only the plain shape is needed.
     */
    default:
      return between(numbers);
  }
}

export const ANCHORS: readonly Anchor[] = build();

/**
 * What a tap at this point is aimed at.
 *
 * Nearest anchor wins, and nothing wins if the tap is further off the cloth
 * than {@link REACH}. Distance is measured plainly rather than weighted by
 * bet type, which matters: a straight-up's anchor is the middle of its square
 * and its edges are half a square away, so a tap clearly inside a number is
 * always nearer that number than any line it touches. The mechanism only feels
 * wrong if that stops being true.
 */
export function nearest(x: number, y: number): string | null {
  let best: string | null = null;
  let near = REACH * REACH;
  for (const anchor of ANCHORS) {
    const distance = (anchor.x - x) ** 2 + (anchor.y - y) ** 2;
    if (distance < near) {
      near = distance;
      best = anchor.spotId;
    }
  }
  return best;
}

/** The squares, for drawing. */
export const SQUARES: readonly { n: number; x: number; y: number }[] = [
  { n: 0, x: 0, y: 0 },
  ...Array.from({ length: 36 }, (_, at) => {
    const n = at + 1;
    return { n, x: columnOf(n), y: rowOf(n) - 1 };
  }),
];
