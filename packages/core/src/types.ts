/**
 * The vocabulary of a table, with nothing in it about any particular game.
 *
 * A table has people at it, one of whom is the host, some of whom are watching
 * and some of whom arrived too late for the game being played. All of that is
 * true of dice, of cards, and of anything else dealt round a table — so it is
 * described once here rather than again in every game.
 */

/** Thrown when a table refuses something. The message is shown to players. */
export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableError";
  }
}

/** Who a seat belongs to, when it belongs to a signed-in player. */
export interface SeatIdentity {
  userId: string;
  /** A ready-to-use image URL, or null for someone with no picture. */
  avatar: string | null;
  /** Their colour, as the 24-bit number Discord gives us. */
  accentColor: number | null;
}

/** How hard a bot plays. Games that have no bots simply never seat one. */
export type BotSkill = "easy" | "normal" | "hard";

export interface Seat {
  id: string;
  name: string;
  connected: boolean;
  /**
   * At the table, but not in the game currently being played.
   *
   * Someone who arrives mid-game sits down for the next one rather than being
   * dealt in. Dealing them in would be unfair at a table playing for chips:
   * they would pay a full stake for a fraction of a game.
   */
  waiting: boolean;
  isBot: boolean;
  skill: BotSkill | null;
  /** Their profile, when they signed in. Guests play without one. */
  userId: string | null;
  avatar: string | null;
  accentColor: number | null;
}

export type TableStatus = "lobby" | "playing" | "over";

/** Nobody sits at a table alone by accident; a solo table is practice. */
export const MIN_SEATS = 1;
/**
 * The most anybody may seat, whatever the game.
 *
 * A ceiling rather than a size: a table picks its own limit within this when
 * it is opened, because six at a card table and ten at one are different
 * evenings and the host is the one who knows which they want.
 */
export const MAX_SEATS = 10;
/** The fewest a host may cap a table at. One seat is not a table. */
export const MIN_TABLE_SEATS = 2;

/**
 * A seat limit somebody asked for, brought inside the house's own.
 *
 * Anything unusable becomes the ceiling rather than an error: this arrives
 * from a client, and a table that will not open is a worse answer than a table
 * with room for everybody.
 */
export function seatLimit(wanted: unknown, ceiling: number = MAX_SEATS): number {
  const top = Math.min(ceiling, MAX_SEATS);
  if (typeof wanted !== "number" || !Number.isInteger(wanted)) {
    return top;
  }
  return Math.min(top, Math.max(MIN_TABLE_SEATS, wanted));
}
/** The longest a name may be, so one player cannot fill the rail. */
export const MAX_NAME = 20;
