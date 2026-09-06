import type { Die, Ruleset } from "@greed/rules";

/** Where a turn is in its cycle. */
export type Phase = "awaiting_roll" | "selecting" | "farkled" | "over";

export type RoomStatus = "lobby" | "playing" | "over";

/** How hard a bot plays. */
export type BotSkill = "easy" | "normal" | "hard";

export interface SeatView {
  id: string;
  name: string;
  /** Banked game score. */
  score: number;
  /** Whether they have met the entry threshold at least once. */
  onBoard: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  /** Playing from a profile rather than as a guest. */
  signedIn: boolean;
  /** At the table, but sitting out the game currently being played. */
  waiting: boolean;
  /** Their picture, when they have one. Guests and bots never do. */
  avatar: string | null;
  /** Their colour, as a 24-bit number, when they have set one. */
  accentColor: number | null;
}

export interface TurnView {
  seatId: string;
  /**
   * Increments on every roll. The client keys its dice animation and its sound
   * off this rather than off the dice themselves, because rolling the same
   * faces twice running is a real roll and must still register.
   */
  rollSeq: number;
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
  /**
   * Epoch milliseconds at which the active player forfeits, or null when no
   * clock is running. Absolute rather than a countdown so the client cannot
   * drift away from the server.
   */
  endsAt: number | null;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  seats: SeatView[];
  /** How many people are watching without a seat. */
  watching: number;
  turn: TurnView | null;
  ruleset: Ruleset;
  /** Chips each seat stakes. Zero for a friendly game. */
  buyIn: number;
  pot: number;
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
  /** Watch a table without taking a seat at it. */
  "lobby:watch": (payload: { code: string }, ack: (result: Ack) => void) => void;
  "lobby:leave": () => void;
  "lobby:addBot": (payload: { skill: BotSkill }) => void;
  "lobby:setRules": (payload: Partial<HouseRules>) => void;
  "lobby:setBuyIn": (payload: { amount: number }) => void;
  "lobby:removeSeat": (payload: { seatId: string }) => void;
  /**
   * Anything a player does at a table, whatever the game.
   *
   * One event rather than a verb each. What is in the payload is the game's
   * business — "roll", "hit", "double" — and the server does not read it, so a
   * new game adds no events here. The ack carries nothing; it only says the
   * server has dealt with it, which is what a client showing a move before the
   * reply needs in order to know when to stop.
   */
  "game:action": (payload: { type: string; [key: string]: unknown }, ack?: () => void) => void;
  "chat:send": (payload: { text: string }) => void;
}

export interface ServerToClient {
  "room:state": (state: RoomView) => void;
  "room:error": (message: string) => void;
  "chat:message": (message: ChatMessage) => void;
}

export interface ChatMessage {
  seatId: string;
  name: string;
  text: string;
  at: number;
}

/** The subset of a ruleset a host may move from the lobby. */
export interface HouseRules {
  targetScore: number;
  entryThreshold: number;
  finalRound: boolean;
  turnTimerSeconds: number | null;
  straight: number | null;
  threePairs: number | null;
  twoTriplets: number | null;
  fourPlusPair: number | null;
}

/** Unambiguous when read aloud: no O/0, I/1, S/5, Z/2. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY346789";
export const CODE_LENGTH = 5;

export const MAX_SEATS = 8;
/** One is allowed: a solo table is practice against the target score. */
export const MIN_SEATS = 1;
