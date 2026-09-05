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

/** Thrown for anything a client did wrong. The socket layer turns it into room:error. */
export class RoomError extends Error {}

/** Injected so tests can roll deterministically. */
export type Roller = (count: number) => Die[];

export interface Seat {
  id: string;
  name: string;
  score: number;
  onBoard: boolean;
  connected: boolean;
}

interface Turn {
  seatIndex: number;
  /** Dice on the table right now. Already-set-aside dice live in `kept`. */
  dice: Die[];
  held: boolean[];
  /** Points banked into this turn before the current selection. */
  kept: number;
  phase: Phase;
}

const DICE_PER_ROLL = 6;

export class Room {
  readonly code: string;
  readonly ruleset: Ruleset;
  seats: Seat[] = [];
  status: RoomStatus = "lobby";
  winnerIds: string[] = [];
  lastEvent: string | null = null;

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

  join(id: string, name: string): Seat {
    if (this.status !== "lobby") {
      throw new RoomError("That game has already started.");
    }
    if (this.seats.length >= MAX_SEATS) {
      throw new RoomError("That table is full.");
    }
    const trimmed = name.trim().slice(0, 20);
    if (trimmed.length === 0) {
      throw new RoomError("Pick a name first.");
    }
    const seat: Seat = { id, name: trimmed, score: 0, onBoard: false, connected: true };
    this.seats.push(seat);
    this.lastEvent = `${trimmed} sat down`;
    return seat;
  }

  /** Marks a seat disconnected. In the lobby the seat is removed outright. */
  disconnect(seatId: string): void {
    const index = this.seats.findIndex((seat) => seat.id === seatId);
    if (index === -1) {
      return;
    }
    const seat = this.seats[index] as Seat;
    if (this.status === "lobby") {
      this.seats.splice(index, 1);
      this.lastEvent = `${seat.name} left`;
      return;
    }
    seat.connected = false;
    this.lastEvent = `${seat.name} dropped out`;
    // Do not stall the table waiting for someone who left.
    if (this.turn !== null && this.turn.seatIndex === index && this.status === "playing") {
      this.advanceTurn();
    }
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
    this.turn = { seatIndex: 0, dice: [], held: [], kept: 0, phase: "awaiting_roll" };
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

    turn.dice = this.roll(toRoll);
    turn.held = turn.dice.map(() => false);
    turn.phase = "selecting";

    const seat = this.seats[turn.seatIndex] as Seat;
    if (!hasAnyScore(turn.dice, this.ruleset)) {
      turn.kept = 0;
      turn.phase = "farkled";
      this.lastEvent = `${seat.name} farkled`;
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
      if (seat === undefined || !seat.connected) {
        continue;
      }
      if (seat.id === this.finalRoundTrigger) {
        this.finish();
        return;
      }
      this.turn = { seatIndex: next, dice: [], held: [], kept: 0, phase: "awaiting_roll" };
      return;
    }
    // Nobody left connected.
    this.finish();
  }

  private finish(): void {
    this.status = "over";
    const best = Math.max(...this.seats.map((seat) => seat.score));
    this.winnerIds = this.seats.filter((seat) => seat.score === best).map((seat) => seat.id);
    const names = this.seats.filter((seat) => this.winnerIds.includes(seat.id)).map((seat) => seat.name);
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
    const valid = scored !== null && scored.valid;

    const remaining = turn.dice.length - selection.length;
    const nextRollCount = turn.phase === "awaiting_roll" ? DICE_PER_ROLL : remaining === 0 ? DICE_PER_ROLL : remaining;

    return {
      seatId: seat.id,
      dice: [...turn.dice],
      held: [...turn.held],
      dead: this.deadFlags(turn),
      kept: turn.kept,
      selection: valid && scored !== null ? scored.points : 0,
      selectionValid: valid,
      nextRollCount,
      bustChance: bustProbability(nextRollCount, this.ruleset),
      phase: turn.phase,
    };
  }

  view(): RoomView {
    const host = this.hostId;
    const seats: SeatView[] = this.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      score: seat.score,
      onBoard: seat.onBoard,
      connected: seat.connected,
      isHost: seat.id === host,
    }));
    return {
      code: this.code,
      status: this.status,
      seats,
      turn: this.turn === null ? null : this.turnView(this.turn),
      ruleset: this.ruleset,
      winnerIds: [...this.winnerIds],
      lastEvent: this.lastEvent,
    };
  }
}
