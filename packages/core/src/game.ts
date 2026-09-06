import type { GameListing } from "./catalogue.js";
import type { Seat, SeatIdentity, TableStatus } from "./types.js";

/**
 * What every table can be asked, whatever is played at it.
 *
 * Written after there were two games rather than one, which is the only way it
 * could have been right: every method here is something both a dice table and
 * a card table already had to do, and nothing here is a dice verb wearing a
 * general-sounding name.
 */
export interface PlayTable {
  readonly code: string;
  readonly status: TableStatus;
  readonly seats: readonly Seat[];
  readonly hostId: string | null;
  readonly isEmpty: boolean;
  readonly lastEvent: string | null;

  join(id: string, name: string, identity: SeatIdentity | null): Seat;
  removeSeat(seatId: string): void;
  disconnect(seatId: string): void;
  reconnect(seatId: string): Seat;
  watch(socketId: string): void;
  unwatch(socketId: string): void;

  /** The table as one seat may see it. Null for somebody only watching. */
  view(forSeatId: string | null): unknown;
}

/** Whose turn it is and when it runs out, for games that hurry people along. */
export interface Clock {
  seatId: string;
  endsAt: number;
}

/** A move a bot wants to make, and how long to look like it thought about it. */
export interface BotMove {
  seatId: string;
  delayMs: number;
  play(): void;
}

/**
 * Everything the socket layer needs from a game that it cannot work out from
 * the table alone.
 *
 * The split is deliberate: PlayTable is what a table *is*, and this is what a
 * game *does* with one — deal it, act on it, decide when it is over and move
 * the chips. A game supplies both and the server knows neither.
 */
export interface GameAdapter<T extends PlayTable = PlayTable> {
  readonly listing: GameListing;

  /**
   * A new table with nobody at it.
   *
   * Options are the game's own — which ruleset, which stake — and are checked
   * by the game rather than by whoever passed them along.
   */
  create(code: string, options?: Record<string, unknown>): T;

  /**
   * Carries out one action.
   *
   * Actions are opaque here on purpose. A game validates its own — the server
   * has no business knowing what "double" or "bank" mean, only that a game
   * refused something and why, which arrives as a TableError.
   */
  act(table: T, seatId: string, action: unknown, deps: GameDeps): Promise<void> | void;

  /** True once a hand or game has finished and its chips should move. */
  isSettled(table: T): boolean;

  /**
   * Moves the chips a finished table owes.
   *
   * Called once per finished table. A game that stakes nothing may do nothing.
   */
  settle(table: T, deps: GameDeps): Promise<void>;

  /** Whose turn is running out, for games with a clock. */
  clock?(table: T): Clock | null;
  /** What to do when it does. */
  timeout?(table: T, seatId: string): void;
  /** A move a seated bot wants to make, if this game has bots. */
  botMove?(table: T): BotMove | null;
  /** A pause the game wants before play moves on, so a result can be read. */
  pause?(table: T): { ms: number; run(): void } | null;
}

/** What a game is handed when it needs to move money or ask who somebody is. */
export interface GameDeps {
  /** Takes chips from a player, or returns false rather than overdrawing. */
  take(userId: string, amount: number): Promise<boolean>;
  /** Gives chips to a player. */
  give(userId: string, amount: number): Promise<void>;
  /** Records what a player did, under this game's own name. */
  record(userId: string, bump: StatBumpLike): Promise<void>;
  /** Writes a finished game into the history. */
  finished(record: FinishedGame): Promise<void>;
}

/** The shape of a stats update, without the economy package having to be here. */
export interface StatBumpLike {
  shared?: { games?: number; wins?: number; chipsWon?: number };
  game?: string;
  add?: Record<string, number>;
  max?: Record<string, number>;
}

/** A finished game, as the history keeps it. */
export interface FinishedGame {
  code: string;
  rulesetName: string;
  buyIn: number;
  pot: number;
  players: Array<{ userId: string | null; name: string; score: number; isBot: boolean }>;
  winnerIds: string[];
  endedAt: number;
}
