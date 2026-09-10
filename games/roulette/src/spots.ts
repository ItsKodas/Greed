import { POCKETS, RED } from "./wheel.js";

/**
 * The cloth: every bet the table will take, and what each one covers.
 *
 * A spot is defined by the pockets it covers and nothing else. That is the one
 * idea this file exists for, because it makes the paytable a consequence
 * rather than a list: a bet wins 36 chips for every chip staked, shared out
 * over however many pockets it covered. Straight up covers one and pays 35 to
 * 1; a corner covers four and pays 8 to 1; red covers eighteen and pays even
 * money. Nobody has to be trusted to type 157 sets of odds correctly.
 *
 * It is also exactly why the bank's guarantee is a flat 36x, whatever the
 * player does with the layout.
 */

export type Kind =
  | "straight"
  | "split"
  | "street"
  | "trio"
  | "corner"
  | "basket"
  | "six"
  | "column"
  | "dozen"
  | "even";

export interface Spot {
  /** Stable, and the only thing a client is allowed to name a bet by. */
  readonly id: string;
  readonly kind: Kind;
  /** What it wins on, ascending. */
  readonly covers: readonly number[];
  /** What it is called out loud. */
  readonly label: string;
}

/**
 * What one chip on this spot wins, on top of getting the chip back.
 *
 * Derived, never stored. See the note at the top of the file: this single line
 * is the entire paytable, and a spot that would pay a fraction of a chip is
 * caught by its own test rather than by a player.
 */
export function pays(spot: Spot): number {
  return 36 / spot.covers.length - 1;
}

/** The numbers 1 to 36, which is the grid; the zero sits outside it. */
const NUMBERS = Array.from({ length: 36 }, (_, at) => at + 1);

/** Which of the three columns a number sits in: 1, 2 or 3. */
const columnOf = (n: number) => ((n - 1) % 3) + 1;

const spot = (kind: Kind, covers: readonly number[], label: string): Spot => {
  const sorted = [...covers].sort((a, b) => a - b);
  return { id: `${kind}:${sorted.join("-")}`, kind, covers: sorted, label };
};

function build(): Spot[] {
  const out: Spot[] = [];

  // Straight up, the zero included.
  out.push(spot("straight", [0], "0"));
  for (const n of NUMBERS) out.push(spot("straight", [n], `${n}`));

  /*
   * Splits: two numbers sharing an edge. Within a row that is n and n+1, but
   * only when they are really side by side — 3 and 4 are consecutive and sit on
   * opposite edges of the cloth, so the column check is doing real work.
   */
  for (const n of NUMBERS) {
    if (columnOf(n) < 3) out.push(spot("split", [n, n + 1], `${n}/${n + 1}`));
    if (n + 3 <= 36) out.push(spot("split", [n, n + 3], `${n}/${n + 3}`));
  }
  // The zero touches the top of the first row.
  for (const n of [1, 2, 3]) out.push(spot("split", [0, n], `0/${n}`));

  // Streets: a whole row of three.
  for (let row = 0; row < 12; row += 1) {
    const first = row * 3 + 1;
    out.push(spot("street", [first, first + 1, first + 2], `${first}-${first + 2}`));
  }

  // The two ways to take the zero with a pair of its neighbours.
  out.push(spot("trio", [0, 1, 2], "0/1/2"));
  out.push(spot("trio", [0, 2, 3], "0/2/3"));

  // Corners: four numbers meeting at one point.
  for (const n of NUMBERS) {
    if (columnOf(n) < 3 && n + 4 <= 36) {
      out.push(spot("corner", [n, n + 1, n + 3, n + 4], `${n}/${n + 1}/${n + 3}/${n + 4}`));
    }
  }

  // The first four, which only a single-zero cloth has.
  out.push(spot("basket", [0, 1, 2, 3], "0-3"));

  // Six lines: two streets side by side.
  for (let row = 0; row < 11; row += 1) {
    const first = row * 3 + 1;
    out.push(
      spot("six", [first, first + 1, first + 2, first + 3, first + 4, first + 5], `${first}-${first + 5}`),
    );
  }

  // Columns, down the cloth.
  for (const column of [1, 2, 3]) {
    out.push(spot("column", NUMBERS.filter((n) => columnOf(n) === column), `Column ${column}`));
  }

  // Dozens, across it.
  for (const dozen of [0, 1, 2]) {
    out.push(
      spot("dozen", NUMBERS.filter((n) => Math.floor((n - 1) / 12) === dozen), `${dozen * 12 + 1}-${dozen * 12 + 12}`),
    );
  }

  /*
   * The even-money bets. Every one of them covers eighteen pockets out of
   * thirty-seven and none of them covers the zero, which is where the whole
   * house edge lives and the only reason the bank ever grows.
   */
  out.push(spot("even", NUMBERS.filter((n) => RED.has(n)), "Red"));
  out.push(spot("even", NUMBERS.filter((n) => !RED.has(n)), "Black"));
  out.push(spot("even", NUMBERS.filter((n) => n % 2 === 1), "Odd"));
  out.push(spot("even", NUMBERS.filter((n) => n % 2 === 0), "Even"));
  out.push(spot("even", NUMBERS.filter((n) => n <= 18), "1-18"));
  out.push(spot("even", NUMBERS.filter((n) => n > 18), "19-36"));

  return out;
}

/**
 * Every spot on the cloth, by id.
 *
 * The server's whole answer to "is this a real bet?". A client names a spot and
 * the table looks it up; a set of numbers somebody liked the look of is not in
 * here and so cannot be bet on, however the message was built.
 */
export const SPOTS: ReadonlyMap<string, Spot> = new Map(build().map((one) => [one.id, one]));

/** The spot with this id, or nothing — which is a refusal, not an error. */
export function spotAt(id: string): Spot | null {
  return SPOTS.get(id) ?? null;
}

/** How many of each kind there are, which exists so a test can count them. */
export function kindsOf(spots: readonly Spot[]): Record<Kind, number> {
  const out = {} as Record<Kind, number>;
  for (const one of spots) out[one.kind] = (out[one.kind] ?? 0) + 1;
  return out;
}

/** Whether a spot wins on this pocket. */
export function hits(spot: Spot, pocket: number): boolean {
  return spot.covers.includes(pocket);
}

/** The most one chip can win anywhere on the cloth, stake included. */
export const MOST_BACK = POCKETS - 1;
