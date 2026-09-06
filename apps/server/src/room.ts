import {
  DEFAULT_RULESET,
  bustProbability,
  enumerateOptions,
  hasAnyScore,
  scoreSelection,
} from "@greed/rules";
import type { Die, Ruleset } from "@greed/rules";
import { MAX_SEATS, MIN_SEATS } from "@greed/shared";
import type { Phase, RoomStatus, RoomView, SeatView, TurnView } from "@greed/shared";
import type { BotSkill } from "./bot.js";

/** Thrown for anything a client did wrong. The socket layer turns it into room:error. */
export class RoomError extends Error {}

/** Injected so tests can roll deterministically. */
export type Roller = (count: number) => Die[];

/**
 * What a signed-in player brings to a seat besides a name. Resolved once when
 * they connect, so the table does not have to ask the store on every render.
 */
export interface SeatIdentity {
  userId: string;
  /** A ready-to-use image URL, or null for someone with no picture. */
  avatar: string | null;
  /** Discord's accent colour, as the 24-bit number they give us. */
  accentColor: number | null;
}

export interface Seat {
  id: string;
  name: string;
  score: number;
  onBoard: boolean;
  connected: boolean;
  /**
   * At the table, but not in the game currently being played.
   *
   * Someone who arrives mid-game sits down for the next one rather than being
   * dealt in. Dealing them in would be worse than it sounds at a table playing
   * for chips: they would pay the same stake as people who have had four turns
   * already, for a fraction of the game.
   */
  waiting: boolean;
  /** Bots never disconnect and are driven by the server, not a socket. */
  isBot: boolean;
  skill: BotSkill | null;
  /** Their profile, when they signed in. Guests play without one. */
  userId: string | null;
  avatar: string | null;
  accentColor: number | null;
}

interface Turn {
  seatIndex: number;
  /** Dice on the table right now. Already-set-aside dice live in `kept`. */
  dice: Die[];
  held: boolean[];
  /** Points banked into this turn before the current selection. */
  kept: number;
  /** How many times these dice have been thrown this turn. */
  seq: number;
  phase: Phase;
}

const DICE_PER_ROLL = 6;

/** True when the roll shows every face exactly once — a straight, or $GREED. */
function isEveryFace(dice: readonly Die[]): boolean {
  if (dice.length !== DICE_PER_ROLL) {
    return false;
  }
  const seen = new Set(dice);
  return seen.size === DICE_PER_ROLL;
}

export class Room {
  readonly code: string;
  ruleset: Ruleset;
  seats: Seat[] = [];
  status: RoomStatus = "lobby";
  /**
   * Sockets watching without a seat.
   *
   * Held by socket rather than by person on purpose: watching is something a
   * connection does, not something an account is, and nothing about it should
   * outlive the tab it happens in. They do not keep an abandoned table alive
   * either — `isEmpty` counts seats, not eyes.
   */
  private readonly watchers = new Set<string>();
  winnerIds: string[] = [];
  lastEvent: string | null = null;
  /** Chips each seat puts in. Zero means a friendly game. */
  buyIn = 0;
  /**
   * When the active player forfeits, in epoch ms. Owned by the socket layer —
   * this class never reads it, so the engine stays free of wall-clock time.
   */
  endsAt: number | null = null;

  private turn: Turn | null = null;
  private readonly roll: Roller;
  /** Seat that reached the target; everyone after it gets one last turn. */
  private finalRoundTrigger: string | null = null;

  constructor(code: string, roll: Roller, ruleset: Ruleset = DEFAULT_RULESET) {
    this.code = code;
    this.roll = roll;
    this.ruleset = ruleset;
  }

  // ---------------------------------------------------------------- lobby

  get hostId(): string | null {
    return this.seats[0]?.id ?? null;
  }

  get isEmpty(): boolean {
    return this.seats.every((seat) => !seat.connected);
  }

  join(id: string, name: string, identity: SeatIdentity | null = null): Seat {
    if (this.seats.length >= MAX_SEATS) {
      throw new RoomError("That table is full.");
    }
    const trimmed = name.trim().slice(0, 20);
    if (trimmed.length === 0) {
      throw new RoomError("Pick a name first.");
    }
    if (this.buyIn > 0 && identity === null) {
      throw new RoomError("That table is playing for chips — sign in first.");
    }
    const seat: Seat = {
      id,
      name: trimmed,
      score: 0,
      onBoard: false,
      connected: true,
      // A table in its lobby deals everyone in; one already playing does not.
      waiting: this.status !== "lobby",
      isBot: false,
      skill: null,
      userId: identity?.userId ?? null,
      avatar: identity?.avatar ?? null,
      accentColor: identity?.accentColor ?? null,
    };
    this.seats.push(seat);
    this.lastEvent = `${trimmed} sat down`;
    return seat;
  }

  /**
   * Applies a host's rule changes. Lobby only — moving the target or the
   * threshold mid-game would rewrite what players had already decided against.
   * The face table is not editable here; a lobby picks an edition instead.
   */
  updateRules(changes: Partial<Ruleset>): void {
    if (this.status !== "lobby") {
      throw new RoomError("The rules are set once the game starts.");
    }
    this.ruleset = Object.freeze({ ...this.ruleset, ...changes });
    this.lastEvent = "House rules changed";
  }

  /**
   * Sets the stake. Everyone seated must be signed in, and no bots may be at
   * the table — a bot has no balance to lose and no account to pay.
   */
  setBuyIn(amount: number): void {
    if (this.status !== "lobby") {
      throw new RoomError("The stake is set before the game starts.");
    }
    if (amount > 0) {
      if (this.seats.some((seat) => seat.isBot)) {
        throw new RoomError("Remove the bots before playing for chips.");
      }
      if (this.seats.some((seat) => seat.userId === null)) {
        throw new RoomError("Everyone has to be signed in to play for chips.");
      }
    }
    this.buyIn = amount;
    this.lastEvent = amount > 0 ? `Buy-in set to ${amount.toLocaleString("en-US")}` : "Playing for fun";
  }

  /** The pot, once everyone has paid in. */
  get pot(): number {
    return this.buyIn * this.seats.length;
  }

  /** Seats a bot. Host-gated by the socket layer; the engine only checks room. */
  addBot(id: string, name: string, skill: BotSkill): Seat {
    if (this.status !== "lobby") {
      throw new RoomError("That game has already started.");
    }
    if (this.seats.length >= MAX_SEATS) {
      throw new RoomError("That table is full.");
    }
    if (this.buyIn > 0) {
      // A bot has no balance to debit and no account to pay, so letting one
      // into a pot would either mint chips or destroy them.
      throw new RoomError("Bots only play for free.");
    }
    const seat: Seat = {
      id,
      name,
      score: 0,
      onBoard: false,
      connected: true,
      waiting: false,
      isBot: true,
      skill,
      userId: null,
      avatar: null,
      accentColor: null,
    };
    this.seats.push(seat);
    this.lastEvent = `${name} sat down`;
    return seat;
  }

  /** The seat whose turn it is, or null outside a running game. */
  watch(socketId: string): void {
    this.watchers.add(socketId);
  }

  unwatch(socketId: string): void {
    this.watchers.delete(socketId);
  }

  activeSeat(): Seat | null {
    if (this.status !== "playing" || this.turn === null) {
      return null;
    }
    return this.seats[this.turn.seatIndex] ?? null;
  }

  /** Points already set aside in the turn under way. */
  get keptThisTurn(): number {
    return this.turn?.kept ?? 0;
  }

  /**
   * How far the active seat is behind the leader when this is its last turn,
   * or null. A bot that would still lose by banking should keep rolling.
   */
  deficitOnFinalTurn(): number | null {
    if (this.finalRoundTrigger === null) {
      return null;
    }
    const seat = this.activeSeat();
    if (seat === null) {
      return null;
    }
    const best = Math.max(...this.seats.map((other) => other.score));
    return Math.max(0, best - seat.score);
  }

  /**
   * Marks a seat disconnected but keeps it, so a refresh can reclaim it. The
   * socket layer drops the seat later if nobody comes back — see removeSeat.
   */
  disconnect(seatId: string): void {
    const index = this.seats.findIndex((seat) => seat.id === seatId);
    if (index === -1) {
      return;
    }
    const seat = this.seats[index] as Seat;
    seat.connected = false;
    this.lastEvent = `${seat.name} dropped out`;
    // Do not stall the table waiting for someone who left.
    if (this.turn?.seatIndex === index && this.status === "playing") {
      this.advanceTurn();
    }
  }

  /**
   * Gives up on a seat that never came back. Only in the lobby: removing a
   * seat mid-game would shift every later seat's index out from under the
   * turn order, and a disconnected seat is simply skipped anyway.
   */
  removeSeat(seatId: string): void {
    if (this.status !== "lobby") {
      return;
    }
    const index = this.seats.findIndex((seat) => seat.id === seatId);
    if (index === -1) {
      return;
    }
    const [seat] = this.seats.splice(index, 1);
    this.lastEvent = `${seat?.name ?? "Someone"} left`;
  }

  reconnect(seatId: string): Seat {
    const seat = this.seats.find((candidate) => candidate.id === seatId);
    if (seat === undefined) {
      throw new RoomError("That seat is gone.");
    }
    seat.connected = true;
    this.lastEvent = `${seat.name} came back`;
    return seat;
  }

  /**
   * Puts a finished table back in its lobby, with everyone still at it.
   *
   * A table outlives a game. Once someone has won, the seats, the host, the
   * rules and the stake are all still perfectly good — what is spent is the
   * scores. Leaving the table and building another one loses the people, which
   * is the expensive part to reassemble.
   */
  playAgain(seatId: string): void {
    if (seatId !== this.hostId) {
      throw new RoomError("Only the host can deal another game.");
    }
    if (this.status !== "over") {
      throw new RoomError("That game is still going.");
    }
    this.status = "lobby";
    this.turn = null;
    this.winnerIds = [];
    // The pot is derived from the stake and the seats, so there is nothing to
    // reset — it is already whatever the next game will be worth.
    for (const seat of this.seats) {
      seat.score = 0;
      seat.onBoard = false;
      // Whoever turned up while the last game was running is in this one.
      seat.waiting = false;
    }
    this.lastEvent = "Another game — sit down or change the rules";
  }

  start(seatId: string): void {
    if (seatId !== this.hostId) {
      throw new RoomError("Only the host can start the game.");
    }
    if (this.status !== "lobby") {
      throw new RoomError("The game is already running.");
    }
    if (this.seats.length < MIN_SEATS) {
      throw new RoomError(`You need at least ${MIN_SEATS} players.`);
    }
    this.status = "playing";
    this.turn = { seatIndex: 0, dice: [], held: [], kept: 0, seq: 0, phase: "awaiting_roll" };
    this.lastEvent = `${this.seats[0]?.name ?? "Someone"} goes first`;
  }

  // ---------------------------------------------------------------- play

  private requireTurn(seatId: string): Turn {
    if (this.status !== "playing" || this.turn === null) {
      throw new RoomError("The game is not running.");
    }
    const seat = this.seats[this.turn.seatIndex];
    if (seat === undefined || seat.id !== seatId) {
      throw new RoomError("It is not your turn.");
    }
    return this.turn;
  }

  private selectedDice(turn: Turn): Die[] {
    return turn.dice.filter((_, index) => turn.held[index] === true);
  }

  doRoll(seatId: string): void {
    const turn = this.requireTurn(seatId);
    if (turn.phase === "farkled" || turn.phase === "over") {
      throw new RoomError("This turn is finished.");
    }

    let toRoll = DICE_PER_ROLL;

    if (turn.phase === "selecting") {
      const selection = this.selectedDice(turn);
      if (selection.length === 0) {
        throw new RoomError("Set aside at least one scoring die first.");
      }
      const scored = scoreSelection(selection, this.ruleset);
      if (!scored.valid) {
        throw new RoomError("That set has a die that scores nothing.");
      }
      turn.kept += scored.points;
      const remaining = turn.dice.length - selection.length;
      // All six set aside: hot dice, roll the lot again.
      toRoll = remaining === 0 ? DICE_PER_ROLL : remaining;
    }

    const rolled = this.roll(toRoll);
    const straight = isEveryFace(rolled);
    // Line a straight up so it reads in face order — 1 to 6, or $GREED. Safe
    // to reorder here because nothing is held yet on a fresh roll, so no index
    // the client is holding can go stale.
    turn.dice = straight ? [...rolled].sort((a, b) => a - b) : rolled;
    turn.held = turn.dice.map(() => false);
    turn.seq += 1;
    turn.phase = "selecting";

    const seat = this.seats[turn.seatIndex] as Seat;
    if (!hasAnyScore(turn.dice, this.ruleset)) {
      turn.kept = 0;
      turn.phase = "farkled";
      this.lastEvent = `${seat.name} farkled`;
      return;
    }
    if (straight) {
      this.lastEvent =
        this.ruleset.skin === "letters"
          ? `${seat.name} rolled $GREED`
          : `${seat.name} rolled a straight`;
      return;
    }
    this.lastEvent = `${seat.name} rolled ${toRoll}`;
  }

  toggle(seatId: string, index: number): void {
    const turn = this.requireTurn(seatId);
    if (turn.phase !== "selecting") {
      throw new RoomError("Roll first.");
    }
    if (!Number.isInteger(index) || index < 0 || index >= turn.dice.length) {
      throw new RoomError("No such die.");
    }
    if (this.deadFlags(turn)[index] === true) {
      throw new RoomError("That die cannot score.");
    }
    turn.held[index] = turn.held[index] !== true;
  }

  bank(seatId: string): void {
    const turn = this.requireTurn(seatId);
    if (turn.phase !== "selecting") {
      throw new RoomError("Roll first.");
    }
    const selection = this.selectedDice(turn);
    if (selection.length === 0) {
      throw new RoomError("Set aside at least one scoring die first.");
    }
    const scored = scoreSelection(selection, this.ruleset);
    if (!scored.valid) {
      throw new RoomError("That set has a die that scores nothing.");
    }

    const seat = this.seats[turn.seatIndex] as Seat;
    const total = turn.kept + scored.points;

    if (!seat.onBoard && total < this.ruleset.entryThreshold) {
      throw new RoomError(`You need ${this.ruleset.entryThreshold} in one turn to get on the board.`);
    }

    seat.score += total;
    seat.onBoard = true;
    this.lastEvent = `${seat.name} banked ${total.toLocaleString("en-US")}`;

    if (seat.score >= this.ruleset.targetScore && this.finalRoundTrigger === null) {
      if (this.ruleset.finalRound) {
        this.finalRoundTrigger = seat.id;
        this.lastEvent = `${seat.name} reached ${this.ruleset.targetScore.toLocaleString("en-US")} — one last turn for everyone`;
      } else {
        this.finish();
        return;
      }
    }

    this.advanceTurn();
  }

  /**
   * The clock ran out. Banks what the player has if it would count, otherwise
   * the turn is lost — the same outcome as a farkle, reached by inaction.
   *
   * Deliberately forgiving: anything already set aside plus a legal current
   * selection is banked, because losing a good turn to a slow connection is a
   * worse experience than a stranger having to wait.
   */
  timeout(seatId: string): void {
    if (this.status !== "playing" || this.turn === null) {
      return;
    }
    const seat = this.seats[this.turn.seatIndex];
    if (seat === undefined || seat.id !== seatId) {
      return;
    }

    const selection = this.selectedDice(this.turn);
    const scored = selection.length > 0 ? scoreSelection(selection, this.ruleset) : null;
    const total = this.turn.kept + (scored?.valid === true ? scored.points : 0);
    const worthBanking = seat.onBoard ? total > 0 : total >= this.ruleset.entryThreshold;

    if (worthBanking) {
      seat.score += total;
      seat.onBoard = true;
      this.lastEvent = `${seat.name} ran out of time and banked ${total.toLocaleString("en-US")}`;
      if (seat.score >= this.ruleset.targetScore && this.finalRoundTrigger === null) {
        if (this.ruleset.finalRound) {
          this.finalRoundTrigger = seat.id;
        } else {
          this.finish();
          return;
        }
      }
    } else {
      this.lastEvent = `${seat.name} ran out of time`;
    }
    this.advanceTurn();
  }

  /**
   * Moves play to the next connected seat. Called by the socket layer after a
   * farkle has been shown, and directly after a bank.
   */
  advanceTurn(): void {
    if (this.status !== "playing" || this.turn === null) {
      return;
    }
    const total = this.seats.length;
    for (let step = 1; step <= total; step += 1) {
      const next = (this.turn.seatIndex + step) % total;
      const seat = this.seats[next];
      // Skipped for the same reason they were never dealt: they arrived after
      // this game began and are waiting for the next one.
      if (seat === undefined || !seat.connected || seat.waiting) {
        continue;
      }
      if (seat.id === this.finalRoundTrigger) {
        this.finish();
        return;
      }
      this.turn = { seatIndex: next, dice: [], held: [], kept: 0, seq: 0, phase: "awaiting_roll" };
      return;
    }
    // Nobody is connected right now. Leave the game exactly where it is rather
    // than declaring a winner: at this instant a refresh and a walk-out look
    // identical, and the empty-room reaper clears the table if nobody returns.
  }

  private finish(): void {
    this.status = "over";
    // Only the people who actually played it can have won it.
    const played = this.seats.filter((seat) => !seat.waiting);
    const best = Math.max(...played.map((seat) => seat.score));
    this.winnerIds = played.filter((seat) => seat.score === best).map((seat) => seat.id);
    const names = played.filter((seat) => this.winnerIds.includes(seat.id)).map((seat) => seat.name);
    this.lastEvent = names.length === 1 ? `${names[0]} wins` : `${names.join(" and ")} tie`;
    if (this.turn !== null) {
      this.turn.phase = "over";
    }
  }

  // ---------------------------------------------------------------- view

  /**
   * Which dice can never belong to a scoring selection.
   *
   * Computed as the union of faces appearing in any fully-scoring option, so a
   * lone 2 among three 2s stays clickable — you have to pick all three before
   * the selection becomes legal, and picking them one at a time must work.
   */
  private deadFlags(turn: Turn): boolean[] {
    const live = new Set<Die>();
    for (const option of enumerateOptions(turn.dice, this.ruleset)) {
      for (let face = 0; face < 6; face += 1) {
        if ((option.counts[face] ?? 0) > 0) {
          live.add((face + 1) as Die);
        }
      }
    }
    return turn.dice.map((die) => !live.has(die));
  }

  private turnView(turn: Turn): TurnView {
    const seat = this.seats[turn.seatIndex] as Seat;
    const selection = this.selectedDice(turn);
    const scored = selection.length > 0 ? scoreSelection(selection, this.ruleset) : null;
    const valid = scored?.valid === true;

    const remaining = turn.dice.length - selection.length;
    const nextRollCount = turn.phase === "awaiting_roll" ? DICE_PER_ROLL : remaining === 0 ? DICE_PER_ROLL : remaining;

    return {
      seatId: seat.id,
      rollSeq: turn.seq,
      dice: [...turn.dice],
      held: [...turn.held],
      dead: this.deadFlags(turn),
      kept: turn.kept,
      selection: valid && scored !== null ? scored.points : 0,
      selectionValid: valid,
      nextRollCount,
      bustChance: bustProbability(nextRollCount, this.ruleset),
      phase: turn.phase,
      endsAt: this.endsAt,
    };
  }

  /**
   * The table as one seat may see it.
   *
   * Greed hides nothing — six dice on a table are six dice on a table, and
   * every seat is told the same thing, so `forSeatId` changes nothing here.
   * The parameter exists because the caller must be in the habit of asking on
   * behalf of somebody: a game with a card face down cannot be bolted onto a
   * server that only knows how to describe a table once.
   *
   * @param forSeatId The seat asking, or null for an onlooker.
   */
  view(forSeatId: string | null = null): RoomView {
    void forSeatId;
    const host = this.hostId;
    const seats: SeatView[] = this.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      score: seat.score,
      onBoard: seat.onBoard,
      connected: seat.connected,
      isHost: seat.id === host,
      isBot: seat.isBot,
      signedIn: seat.userId !== null,
      waiting: seat.waiting,
      avatar: seat.avatar,
      accentColor: seat.accentColor,
    }));
    return {
      code: this.code,
      status: this.status,
      watching: this.watchers.size,
      seats,
      turn: this.turn === null ? null : this.turnView(this.turn),
      ruleset: this.ruleset,
      buyIn: this.buyIn,
      pot: this.pot,
      winnerIds: [...this.winnerIds],
      lastEvent: this.lastEvent,
    };
  }
}
