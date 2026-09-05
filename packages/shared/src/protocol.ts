import type { Die, Ruleset } from "@greed/rules";

/** Where a turn is in its cycle. */
export type Phase = "awaiting_roll" | "selecting" | "farkled" | "over";

export type RoomStatus = "lobby" | "playing" | "over";

export interface SeatView {
  id: string;
  name: string;
  /** Banked game score. */
  score: number;
  /** Whether they have met the entry threshold at least once. */
  onBoard: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface TurnView {
  seatId: string;
  /** The dice currently on the table. Set-aside dice are folded into `kept`. */
  dice: Die[];
  /** Parallel to `dice`: which are currently picked up. */
  held: boolean[];
  /** Parallel to `dice`: which can never be part of a scoring selection. */
  dead: boolean[];
  /** Points already set aside this turn, before the current selection. */
  kept: number;
  /** What the current selection is worth, or 0 when it is not legal. */
  selection: number;
  /** Whether the current selection could be banked or rolled on. */
  selectionValid: boolean;
  /** Dice that would be rolled next, accounting for hot dice. */
  nextRollCount: number;
  /** Chance the next roll scores nothing, 0..1. */
  bustChance: number;
  phase: Phase;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  seats: SeatView[];
  turn: TurnView | null;
  ruleset: Ruleset;
  /** Set when status is "over". */
  winnerIds: string[];
  /** A short line describing what just happened, for the activity strip. */
  lastEvent: string | null;
}

export type Ack =
  | { ok: true; code: string; seatId: string }
  | { ok: false; error: string };

export interface ClientToServer {
  "lobby:create": (
    payload: { name: string; ruleset?: string },
    ack: (result: Ack) => void,
  ) => void;
  "lobby:join": (payload: { name: string; code: string }, ack: (result: Ack) => void) => void;
  "lobby:resume": (payload: { seatId: string; code: string }, ack: (result: Ack) => void) => void;
  "game:start": () => void;
  "game:roll": () => void;
  "game:toggle": (payload: { index: number }) => void;
  "game:bank": () => void;
}

export interface ServerToClient {
  "room:state": (state: RoomView) => void;
  "room:error": (message: string) => void;
}

/** Unambiguous when read aloud: no O/0, I/1, S/5, Z/2. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY346789";
export const CODE_LENGTH = 5;

export const MAX_SEATS = 8;
/** One is allowed: a solo table is practice against the target score. */
export const MIN_SEATS = 1;
