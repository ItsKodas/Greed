import type { PlayTable, Seat as TableSeat, SeatIdentity, TableStatus } from "@backroom/core";
import { Seating, TableError } from "@backroom/core";
import type { Card } from "./cards.js";
import { Deck } from "./cards.js";
import { best, compare, describe } from "./hand.js";
import type { Score } from "./hand.js";
import type { Contribution } from "./pot.js";
import { pots, split } from "./pot.js";

/**
 * A hold'em table.
 *
 * The rules, and nothing else: no chips leave an account here and no socket is
 * touched. What this owns is who is in the hand, whose turn it is, what the
 * betting has been, and who takes what at the end — the questions that have
 * exactly one right answer and are worth being able to test without a server.
 *
 * The one design decision worth stating up front is that a seat's `stack` is
 * chips *at the table*, not chips in an account. Money enters when somebody
 * sits down and leaves when they stand up, which is what a real table does and
 * what keeps the betting arithmetic away from the economy entirely.
 */

export type Street = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";

export type Move = "fold" | "check" | "call" | "raise" | "allIn";

export interface Seat extends TableSeat {
  /** Chips in front of them at this table. */
  stack: number;
  /** Their two cards, once they have been dealt any. */
  hole: Card[];
  /** What they have put in on this street. */
  committed: number;
  /** What they have put in across the whole hand. */
  paid: number;
  folded: boolean;
  allIn: boolean;
  /** Whether they have acted since the last raise. */
  acted: boolean;
  /** Sat down mid-hand, and dealt in from the next one. */
  waiting: boolean;
  /** What they turned over, once there has been a showdown. */
  showed: Score | null;
}

/** What a hand paid, once it is over. */
export interface Payout {
  seatId: string;
  name: string;
  chips: number;
  /** How the hand read, or null when everybody else folded. */
  said: string | null;
}

/** The smallest table that can play a hand: heads up. */
export const MIN_SEATS = 2;

export class Table implements PlayTable {
  street: Street = "waiting";
  board: Card[] = [];

  private acting: string | null = null;
  /**
   * When the seat now to act was first asked.
   *
   * Stamped by the setter below rather than by every place that hands the turn
   * on, because there are several and one of them forgetting would leave a
   * player with somebody else's clock — which reads as a turn that expires the
   * instant it arrives.
   */
  actingSince: number | null = null;

  /** Whose turn it is, or null when nobody is being waited on. */
  get toAct(): string | null {
    return this.acting;
  }

  set toAct(id: string | null) {
    if (id !== this.acting) {
      this.actingSince = id === null ? null : Date.now();
    }
    this.acting = id;
  }
  /** Which seat has the button, by id. */
  button: string | null = null;
  /** What the last hand paid out, for the felt to show. */
  paid: Payout[] = [];
  lastEvent: string | null = null;

  /**
   * Chips owed back to people who have stood up, and not yet handed over.
   *
   * A queue rather than a payment, because the table cannot pay anybody — it
   * has never heard of an account. Whoever is holding the economy drains this
   * once and gives the chips back, which is the only moment poker touches it
   * apart from sitting down.
   */
  readonly owedOut: Array<{ userId: string; name: string; chips: number }> = [];

  private readonly seating: Seating;
  private deck: Deck | null = null;
  /** The largest raise made on this street, which sets the minimum for the next. */
  private raiseSize = 0;

  constructor(
    readonly code: string,
    private readonly random: () => number,
    readonly smallBlind: number,
    readonly bigBlind: number,
    maxSeats: number,
  ) {
    this.seating = new Seating(maxSeats);
  }

  // ------------------------------------------------------------- the table

  get seats(): Seat[] {
    return this.seating.seats as Seat[];
  }

  get maxSeats(): number {
    return this.seating.limit;
  }

  get hostId(): string | null {
    return this.seating.hostId;
  }

  get isEmpty(): boolean {
    return this.seating.isEmpty;
  }

  get watching(): number {
    return this.seating.watching;
  }

  /**
   * A poker table is only ever playing or waiting to.
   *
   * There is no lobby: a hand starts when two people are sitting down and
   * stops when they are not, so there is nothing for a host to start.
   */
  get status(): TableStatus {
    return this.street === "waiting" ? "lobby" : "playing";
  }

  watch(socketId: string): void {
    this.seating.watch(socketId);
  }

  unwatch(socketId: string): void {
    this.seating.unwatch(socketId);
  }

  disconnect(seatId: string): void {
    this.seating.disconnect(seatId);
    /*
     * A hand does not wait for somebody who has gone. Their chips stay in —
     * dropping out is folding, not taking your money back off the table.
     */
    const seat = this.seating.find(seatId) as Seat | undefined;
    if (seat !== undefined && this.street !== "waiting" && !seat.folded) {
      seat.folded = true;
      if (this.toAct === seatId) {
        this.moveOn(seatId);
      }
      this.settleIfDone();
    }
  }

  reconnect(seatId: string): Seat {
    return this.seating.reconnect(seatId) as Seat;
  }

  removeSeat(seatId: string): void {
    this.leave(seatId);
  }

  join(id: string, name: string, identity: SeatIdentity | null): Seat {
    // Chips only, so a seat has to be somebody: a pot is other people's money.
    const seat = this.seating.join(id, name, this.status, identity, true) as Seat;
    seat.stack = 0;
    seat.hole = [];
    seat.committed = 0;
    seat.paid = 0;
    seat.folded = false;
    seat.allIn = false;
    seat.acted = false;
    seat.showed = null;
    this.lastEvent = `${seat.name} sat down`;
    return seat;
  }

  /**
   * Puts chips on the table in front of a seat.
   *
   * The table never asks anybody for them: whoever calls this has already
   * taken them off an account, and this is only the other half of that move.
   * Keeping it this way round is what stops the rules ever touching the
   * economy — a hand of poker is arithmetic over stacks, and where the stacks
   * came from is somebody else's problem.
   */
  buyIn(seatId: string, chips: number): void {
    const seat = this.seating.find(seatId) as Seat | undefined;
    if (seat === undefined) {
      throw new TableError("You are not at this table.");
    }
    if (chips <= 0) {
      return;
    }
    seat.stack += chips;
    this.lastEvent = `${seat.name} sat down with ${chips.toLocaleString("en-US")}`;
  }

  /**
   * Takes a seat's chips off the table, and says how many there were.
   *
   * Refuses while they are in a hand, because chips on the felt are not
   * theirs to take back yet — that is the whole of what a bet is.
   */
  cashOut(seatId: string): number {
    const seat = this.seating.find(seatId) as Seat | undefined;
    if (seat === undefined) {
      return 0;
    }
    const chips = seat.stack;
    seat.stack = 0;
    return chips;
  }

  leave(id: string): void {
    const gone = this.seating.find(id) as Seat | undefined;
    if (gone === undefined) {
      return;
    }
    const wasIn = this.street !== "waiting" && !gone.folded && gone.hole.length > 0;
    if (wasIn) {
      gone.folded = true;
    }
    /*
     * Whatever is still in front of them comes off the table with them. Chips
     * already in the pot do not: those stopped being theirs when they bet them,
     * which is the whole of what a bet is.
     */
    const left = this.cashOut(id);
    if (left > 0 && gone.userId !== null) {
      this.owedOut.push({ userId: gone.userId, name: gone.name, chips: left });
    }
    this.seating.remove(id);
    this.lastEvent = `${gone.name} left`;
    /*
     * Their chips stay in the pot. Standing up mid-hand is folding, not taking
     * your money back off the table — otherwise the way to never lose a hand
     * would be to close the tab whenever it was going badly.
     */
    if (wasIn) {
      if (this.toAct === id) {
        this.moveOn(id);
      }
      this.settleIfDone();
    }
  }

  /** The table as one seat may see it: everybody else's cards stay face down. */
  view(forSeatId: string | null): unknown {
    return {
      code: this.code,
      street: this.street,
      board: this.board,
      pot: this.pot,
      toAct: this.toAct,
      button: this.button,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      paid: this.paid,
      lastEvent: this.lastEvent,
      watching: this.seating.watching,
      seats: this.seats.map((seat) => ({
        id: seat.id,
        name: seat.name,
        connected: seat.connected,
        waiting: seat.waiting,
        avatar: seat.avatar,
        accentColor: seat.accentColor,
        stack: seat.stack,
        committed: seat.committed,
        folded: seat.folded,
        allIn: seat.allIn,
        /*
         * The whole reason a view is per-seat. Your own cards, and anybody
         * else's only once they have been turned over at a showdown — a hand
         * that reached another player's browser face down would be a hand they
         * could read out of the network tab.
         */
        hole:
          seat.id === forSeatId || seat.showed !== null
            ? seat.hole
            : seat.hole.map(() => null),
        showed: seat.showed === null ? null : describe(seat.showed),
      })),
    };
  }

  /** Everybody who could be dealt into a hand right now. */
  private get ready(): Seat[] {
    return this.seats.filter((seat) => !seat.waiting && seat.stack > 0);
  }

  /** Everybody still in the hand, folded or not, who put chips in. */
  private get inHand(): Seat[] {
    return this.seats.filter((seat) => seat.paid > 0 || (!seat.waiting && seat.hole.length > 0));
  }

  /** Everybody who has not folded. */
  private get live(): Seat[] {
    return this.seats.filter((seat) => seat.hole.length > 0 && !seat.folded);
  }

  /** Everybody who could still put another chip in. */
  private get actors(): Seat[] {
    return this.live.filter((seat) => !seat.allIn);
  }

  get canDeal(): boolean {
    return this.street === "waiting" && this.ready.length >= MIN_SEATS;
  }

  // -------------------------------------------------------------- the hand

  deal(): void {
    if (this.street !== "waiting") {
      throw new TableError("That hand is already going.");
    }
    if (this.ready.length < MIN_SEATS) {
      throw new TableError("A hand of poker needs two people.");
    }

    /*
     * A fresh deck every hand, never refilled. Twenty-eight cards is the most
     * a full ring can need and there are fifty-two, so it cannot run out — and
     * a deck carried between hands is a deck somebody can count.
     */
    this.deck = new Deck(this.random);
    this.board = [];
    this.paid = [];
    for (const seat of this.seats) {
      seat.hole = [];
      seat.committed = 0;
      seat.paid = 0;
      seat.folded = false;
      seat.allIn = false;
      seat.acted = false;
      seat.showed = null;
    }
    // Anybody who sat out the last hand is dealt into this one.
    this.seating.dealInWaiting();

    this.moveButton();
    const playing = this.ready;
    for (const seat of playing) {
      seat.hole = [this.deck.draw(), this.deck.draw()];
    }

    this.postBlinds(playing);
    this.street = "preflop";
    /*
     * Under the gun: the seat after the big blind. Heads up is the exception
     * the rules make everywhere — with two players the button is the small
     * blind and acts first before the flop, and last after it.
     */
    this.toAct =
      playing.length === 2
        ? (this.buttonSeat(playing)?.id ?? null)
        : (this.after(this.bigBlindSeat(playing)?.id ?? null, playing)?.id ?? null);
    this.lastEvent = "Cards out";
  }

  /** Moves the button to the next seat that is playing. */
  private moveButton(): void {
    const playing = this.ready;
    if (playing.length === 0) {
      return;
    }
    if (this.button === null || !playing.some((seat) => seat.id === this.button)) {
      this.button = playing[0]?.id ?? null;
      return;
    }
    this.button = this.after(this.button, playing)?.id ?? null;
  }

  private buttonSeat(playing: Seat[]): Seat | undefined {
    return playing.find((seat) => seat.id === this.button);
  }

  private smallBlindSeat(playing: Seat[]): Seat | undefined {
    // Heads up, the button is the small blind. Otherwise it is the seat after.
    return playing.length === 2
      ? this.buttonSeat(playing)
      : this.after(this.button, playing);
  }

  private bigBlindSeat(playing: Seat[]): Seat | undefined {
    return this.after(this.smallBlindSeat(playing)?.id ?? null, playing);
  }

  private postBlinds(playing: Seat[]): void {
    const small = this.smallBlindSeat(playing);
    const big = this.bigBlindSeat(playing);
    if (small !== undefined) {
      this.put(small, Math.min(this.smallBlind, small.stack));
    }
    if (big !== undefined) {
      this.put(big, Math.min(this.bigBlind, big.stack));
    }
    /*
     * The blind is the opening raise, so the first real raise has to be at
     * least another one of it. Without this the minimum would be zero and a
     * player could raise by a single chip forever.
     */
    this.raiseSize = this.bigBlind;
  }

  /** Moves chips from a stack onto the felt, and marks an empty stack all in. */
  private put(seat: Seat, amount: number): void {
    const paid = Math.max(0, Math.min(amount, seat.stack));
    seat.stack -= paid;
    seat.committed += paid;
    seat.paid += paid;
    if (seat.stack === 0) {
      seat.allIn = true;
    }
  }

  /** The seat after this one, wrapping, among those given. */
  private after(id: string | null, among: Seat[]): Seat | undefined {
    if (among.length === 0) {
      return undefined;
    }
    const at = among.findIndex((seat) => seat.id === id);
    return among[(at + 1) % among.length];
  }

  /** The highest anybody has committed on this street. */
  private get highest(): number {
    return Math.max(0, ...this.live.map((seat) => seat.committed));
  }

  /** What this seat would have to put in to call. */
  owed(seat: Seat): number {
    return Math.max(0, Math.min(this.highest - seat.committed, seat.stack));
  }

  /** The smallest raise this seat could make, as a total commitment. */
  minRaise(seat: Seat): number {
    return this.highest + Math.max(this.raiseSize, this.bigBlind) - seat.committed;
  }

  // ------------------------------------------------------------- the moves

  act(seatId: string, move: Move, amount = 0): void {
    if (this.toAct !== seatId) {
      throw new TableError("It is not your turn.");
    }
    const seat = this.seats.find((one) => one.id === seatId);
    if (seat === undefined) {
      throw new TableError("You are not at this table.");
    }

    switch (move) {
      case "fold":
        seat.folded = true;
        this.lastEvent = `${seat.name} folded`;
        break;
      case "check":
        if (this.owed(seat) > 0) {
          throw new TableError("You cannot check for free.");
        }
        this.lastEvent = `${seat.name} checked`;
        break;
      case "call": {
        const owed = this.owed(seat);
        if (owed === 0) {
          throw new TableError("There is nothing to call.");
        }
        this.put(seat, owed);
        this.lastEvent = `${seat.name} called ${owed.toLocaleString("en-US")}`;
        break;
      }
      case "allIn": {
        const all = seat.stack;
        if (all === 0) {
          throw new TableError("You have nothing left to put in.");
        }
        this.raiseBy(seat, all);
        this.lastEvent = `${seat.name} is all in`;
        break;
      }
      case "raise": {
        const more = Math.floor(amount) - seat.committed;
        if (more <= this.owed(seat)) {
          throw new TableError("A raise has to be more than a call.");
        }
        if (more > seat.stack) {
          throw new TableError("You cannot cover that.");
        }
        if (more < this.minRaise(seat) && more < seat.stack) {
          throw new TableError(
            `The smallest raise is to ${(this.highest + Math.max(this.raiseSize, this.bigBlind)).toLocaleString("en-US")}.`,
          );
        }
        this.raiseBy(seat, more);
        this.lastEvent = `${seat.name} raised to ${seat.committed.toLocaleString("en-US")}`;
        break;
      }
    }

    seat.acted = true;
    this.moveOn(seatId);
    this.settleIfDone();
  }

  /**
   * Puts more in, and reopens the betting if it was a full raise.
   *
   * An all-in for less than a full raise does not reopen it: everybody who has
   * already acted keeps their word and only owes the difference. Getting this
   * wrong lets a short stack hand somebody else another go at raising, which
   * is a real and well-known way to soft-play a table.
   */
  private raiseBy(seat: Seat, more: number): void {
    const was = this.highest;
    this.put(seat, more);
    const raise = seat.committed - was;
    if (raise >= this.raiseSize) {
      this.raiseSize = raise;
      for (const other of this.live) {
        if (other.id !== seat.id) {
          other.acted = false;
        }
      }
    }
  }

  /** Hands the turn to the next seat that still has a decision to make. */
  private moveOn(from: string): void {
    const order = this.live;
    if (order.length === 0) {
      this.toAct = null;
      return;
    }
    let next = this.after(from, order);
    for (let step = 0; step < order.length; step += 1) {
      if (next === undefined) {
        break;
      }
      if (!next.allIn && (!next.acted || this.owed(next) > 0)) {
        this.toAct = next.id;
        return;
      }
      next = this.after(next.id, order);
    }
    this.toAct = null;
  }

  /** Whether the betting on this street is finished. */
  private get streetClosed(): boolean {
    if (this.live.length <= 1) {
      return true;
    }
    const owing = this.actors.filter((seat) => !seat.acted || this.owed(seat) > 0);
    return owing.length === 0;
  }

  private settleIfDone(): void {
    if (this.street === "waiting" || this.street === "showdown") {
      return;
    }
    if (this.live.length === 1) {
      this.award();
      return;
    }
    if (!this.streetClosed) {
      return;
    }
    this.nextStreet();
  }

  /** Sweeps the street's bets into the hand and turns the next cards over. */
  private nextStreet(): void {
    for (const seat of this.seats) {
      seat.committed = 0;
      seat.acted = false;
    }
    this.raiseSize = this.bigBlind;

    const deck = this.deck;
    if (deck === null) {
      return;
    }
    if (this.street === "preflop") {
      deck.draw();
      this.board = [deck.draw(), deck.draw(), deck.draw()];
      this.street = "flop";
    } else if (this.street === "flop") {
      deck.draw();
      this.board.push(deck.draw());
      this.street = "turn";
    } else if (this.street === "turn") {
      deck.draw();
      this.board.push(deck.draw());
      this.street = "river";
    } else {
      this.award();
      return;
    }

    /*
     * After the flop the first to speak is the seat left of the button, which
     * is a different seat from the one who opened before it. With everybody
     * left all in there is nobody to ask, and the streets simply run out.
     */
    const order = this.live;
    this.toAct = this.after(this.button, order)?.id ?? null;
    if (this.actors.length <= 1) {
      this.toAct = null;
      this.nextStreet();
      return;
    }
    if (this.toAct !== null && (this.seats.find((s) => s.id === this.toAct)?.allIn ?? false)) {
      this.moveOn(this.toAct);
    }
  }

  // ------------------------------------------------------------ the payout

  /** Works out who won what, moves the chips, and ends the hand. */
  private award(): void {
    const contested = this.live;
    const contributions: Contribution[] = this.inHand.map((seat) => ({
      seatId: seat.id,
      paid: seat.paid,
      contesting: !seat.folded,
    }));

    /*
     * A showdown only happens if more than one player is still in it. When
     * everybody else folded, the last one standing takes it without showing —
     * which is a rule about privacy as much as pace: a hand nobody paid to see
     * is a hand nobody gets to see.
     */
    const shown = contested.length > 1;
    const scores = new Map<string, Score>();
    if (shown) {
      for (const seat of contested) {
        const score = best([...seat.hole, ...this.board]);
        seat.showed = score;
        scores.set(seat.id, score);
      }
    }

    const won = new Map<string, number>();
    for (const pot of pots(contributions)) {
      const runners = pot.eligible.filter((id) => contested.some((seat) => seat.id === id));
      if (runners.length === 0) {
        continue;
      }
      let winners = runners;
      if (shown) {
        /*
         * A plain sweep for the best hand, keeping ties. Written as a loop
         * rather than a reduce because the accumulator is a list that grows on
         * a tie, and rebuilding it each time is a copy per player for no
         * reason — the shape of a split pot is exactly the case that makes it
         * grow.
         */
        winners = [];
        for (const id of runners) {
          if (winners.length === 0) {
            winners.push(id);
            continue;
          }
          const how = compare(
            scores.get(id) as Score,
            scores.get(winners[0] as string) as Score,
          );
          if (how > 0) {
            winners = [id];
          } else if (how === 0) {
            winners.push(id);
          }
        }
      }
      for (const [id, chips] of split(pot.chips, winners)) {
        won.set(id, (won.get(id) ?? 0) + chips);
      }
    }

    this.paid = [];
    for (const [id, chips] of won) {
      const seat = this.seats.find((one) => one.id === id);
      if (seat === undefined) {
        continue;
      }
      seat.stack += chips;
      this.paid.push({
        seatId: id,
        name: seat.name,
        chips,
        said: shown ? describe(scores.get(id) as Score) : null,
      });
    }

    /*
     * The middle is empty now. Every chip that was in it is in somebody's
     * stack, so leaving the contributions set would have the table claiming
     * the same money twice — once in the pot and once in front of whoever won
     * it, which reads as a table that mints on every showdown.
     */
    for (const seat of this.seats) {
      seat.committed = 0;
      seat.paid = 0;
    }

    const first = this.paid[0];
    this.lastEvent =
      this.paid.length === 1 && first !== undefined
        ? `${first.name} won ${first.chips.toLocaleString("en-US")}${first.said === null ? "" : ` with ${first.said}`}`
        : "Split pot";
    this.street = "showdown";
    this.toAct = null;
  }

  /** Clears the felt so the next hand can be dealt. */
  finish(): void {
    if (this.street !== "showdown") {
      return;
    }
    this.street = "waiting";
    this.board = [];
    for (const seat of this.seats) {
      seat.hole = [];
      seat.showed = null;
      seat.committed = 0;
      seat.paid = 0;
      seat.folded = false;
      seat.allIn = false;
      seat.acted = false;
    }
  }

  /** Everything in the middle: what has been swept in plus what is on the felt. */
  get pot(): number {
    return this.seats.reduce((total, seat) => total + seat.paid, 0);
  }
}
