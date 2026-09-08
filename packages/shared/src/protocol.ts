import type { Die, Ruleset } from "@backroom/rules";

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

/**
 * What the server adds to every table state, whatever the game.
 *
 * Both of these are the building's business rather than any game's: which
 * game is being played, and whether the table is on the public list. A game
 * knows neither, which is why they are added around its view instead of asked
 * of it.
 */
export interface TableEnvelope {
  game: string;
  listed: boolean;
}

/** Any game's view of a table, wrapped in what the room knows about it. */
export type TableState = TableEnvelope & Record<string, unknown>;

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

/** A public table, as the room advertises it to somebody looking for one. */
export interface TableOnOffer {
  code: string;
  game: string;
  /** Who opened it. */
  host: string;
  seats: number;
  maxSeats: number;
  /** How many are stood watching. */
  watching: number;
  status: RoomStatus;
}

export interface ClientToServer {
  "lobby:create": (
    /**
     * `game` names which table to open; left out, it is Greed, as it always
     * was. `listed` puts it on the public list, and is the default — a table
     * nobody can find is a table you have to organise before you can play at.
     */
    payload: {
      name: string;
      game?: string;
      ruleset?: string;
      listed?: boolean;
      /** How many seats the host wants. Absent means as many as the game allows. */
      maxSeats?: number;
      /** Play money, so anybody may sit down. The game decides what it means. */
      forFun?: boolean;
    },
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
  /** Whether the table appears on the public list. The host's call. */
  "lobby:setListed": (payload: { listed: boolean }) => void;
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
  /**
   * One pull of the lever at the slot machine.
   *
   * An event of its own rather than a game:action, because there is no table
   * for one to act on: a machine has no seats, no turns and no opponents, and
   * catalogue.ts already says that forcing one through a table would bend both
   * out of shape.
   */
  "slots:spin": (payload: { stake: number }, ack: (result: SpinResult) => void) => void;
}

/**
 * The faces on the reels, as they travel over the wire.
 *
 * Written out here as well as in games/slots because shared sits beneath the
 * games and cannot import from one. They have to agree, and a test in
 * games/slots fails if they stop agreeing — a face this end does not know
 * renders as a blank reel, which reads as a broken machine rather than a
 * broken build.
 */
export const SPIN_FACES = [
  "chip",
  "dice",
  "spade",
  "horseshoe",
  "bell",
  "seven",
] as const;

export type SpinFace = (typeof SPIN_FACES)[number];

/** One payline that paid, and what it paid. */
export interface SpinLine {
  /** Which of the nine lines, so the glass can light the right one. */
  line: number;
  face: SpinFace;
  length: number;
  pay: number;
}

/** What the machine did with a pull of the lever. */
export type SpinResult =
  | {
      ok: true;
      /** Five columns of three, top row first. */
      grid: SpinFace[][];
      lines: SpinLine[];
      /** Everything won, jackpot included. */
      won: number;
      jackpot: boolean;
      /** What the bank holds now, so the sign can be right without a refetch. */
      bank: number;
      /** The player's balance now, for the same reason. */
      balance: number;
    }
  | { ok: false; error: string };

export interface ServerToClient {
  /**
   * The table, as this seat may see it.
   *
   * Shaped by whichever game is being played, so it carries the game's id and
   * nothing more is promised here. A client knows which game it opened and
   * reads the rest accordingly; the alternative is a union that every game has
   * to be added to, which is the coupling this whole layer just shed.
   */
  "room:state": (state: TableState) => void;
  "room:error": (message: string) => void;
  "chat:message": (message: ChatMessage) => void;
  /**
   * What this account is now worth, pushed as it changes.
   *
   * Chips move while you are looking at them — a stake is taken as it is
   * placed and a hand pays out on its own clock — and a balance that only
   * catches up on a page load is a balance nobody trusts. Sent only to the
   * sockets signed in as that account, so it is never anybody else's business.
   */
  "me:chips": (chips: number) => void;
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
