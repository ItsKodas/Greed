import { MIN_SEATS, Seating, TableError } from "@backroom/core";
import type { BotSkill, Seat as TableSeat, SeatIdentity, TableStatus } from "@backroom/core";
import { Shoe } from "./cards.js";
import type { Card } from "./cards.js";
import { isBlackjack, value } from "./hand.js";

/** What a seat is at a blackjack table: a stake, a hand, and how it ended. */
export interface Seat extends TableSeat {
  /** Chips staked on this hand. Zero until they bet. */
  bet: number;
  cards: Card[];
  /** Set once they can take no more cards. */
  done: boolean;
  outcome: Outcome | null;
  /** Chips handed back when the hand settled — stake included. */
  returned: number;
  /**
   * Play money, at a table playing for none.
   *
   * Only ever touched at a for-fun table, where it is the whole economy: it
   * is made up when the seat sits down, it never reaches an account, and it
   * dies with the table. At a table playing for real chips it stays at zero
   * and the economy is asked instead.
   */
  purse: number;
}

export type Outcome = "blackjack" | "won" | "push" | "lost" | "bust";

export type Phase = "betting" | "playing" | "dealer" | "settled";

/** What one seat may see of another. */
export interface SeatView {
  id: string;
  name: string;
  connected: boolean;
  waiting: boolean;
  isBot: boolean;
  avatar: string | null;
  accentColor: number | null;
  bet: number;
  cards: Card[];
  total: number;
  soft: boolean;
  bust: boolean;
  done: boolean;
  outcome: Outcome | null;
  returned: number;
  /** Play money at a for-fun table, and zero everywhere else. */
  purse: number;
}

export interface TableView {
  code: string;
  status: TableStatus;
  phase: Phase;
  seats: SeatView[];
  /** Whose turn it is, or null between hands. */
  turnSeatId: string | null;
  hostId: string | null;
  watching: number;
  lastEvent: string | null;
  dealer: {
    cards: Card[];
    /** Of the cards shown. While one is face down, that is all it counts. */
    total: number;
    /** True while a card is still face down. */
    hidden: boolean;
  };
  minBet: number;
  maxBet: number;
  /** True when nothing at this table is played for real chips. */
  forFun: boolean;
}

const MIN_BET = 100;
const MAX_BET = 10_000;
/**
 * What a seat is handed at a for-fun table, and topped back up to when it runs
 * dry. There is nothing to protect here — the point of play money is that
 * losing it costs nothing — so running out ends the fun rather than teaching
 * anybody a lesson.
 */
const FUN_PURSE = 5_000;
/** The dealer takes cards to here and stops, soft or hard. */
const DEALER_STANDS = 17;

/**
 * A blackjack table.
 *
 * Everybody plays the dealer rather than each other, which is what makes this
 * a useful second game: hidden information, a stake per hand, and no score to
 * be won. Three things Greed does not have, and so three places where the
 * shared parts either generalise or turn out not to.
 */
export class Table {
  readonly code: string;
  /**
   * Whether this table plays for play money.
   *
   * Fixed when the table is opened. It cannot be changed afterwards, because
   * the two are not the same game with a different label on it: one can be
   * sat at by anybody and pays nothing, and the other takes chips out of a
   * real account.
   */
  readonly forFun: boolean;
  status: TableStatus = "lobby";
  phase: Phase = "betting";
  lastEvent: string | null = null;
  dealer: Card[] = [];
  private turnIndex = -1;
  private readonly seating = new Seating();
  private readonly shoe: Shoe;

  constructor(code: string, random: () => number = Math.random, forFun = false) {
    this.code = code;
    this.forFun = forFun;
    this.shoe = new Shoe(random);
  }

  get seats(): Seat[] {
    return this.seating.seats as Seat[];
  }

  get hostId(): string | null {
    return this.seating.hostId;
  }

  get isEmpty(): boolean {
    return this.seating.isEmpty;
  }

  /** Everyone actually in the hand being played. */
  private get playing(): Seat[] {
    return this.seats.filter((seat) => !seat.waiting && seat.bet > 0);
  }

  // ------------------------------------------------------------- the table

  join(id: string, name: string, identity: SeatIdentity | null = null): Seat {
    /*
     * A hand with nothing staked has nothing to decide, so a blackjack table
     * always plays for something — but it need not be somebody's real chips.
     * At a for-fun table the stake is play money the table invents, which is
     * a stake for the purposes of the game and no reason to ask who anybody
     * is.
     */
    const seat = this.seating.join(id, name, this.status, identity, !this.forFun) as Seat;
    this.clear(seat);
    seat.purse = this.forFun ? FUN_PURSE : 0;
    this.lastEvent = `${seat.name} sat down`;
    return seat;
  }

  addBot(id: string, name: string, skill: BotSkill): Seat {
    const seat = this.seating.addBot(id, name, skill) as Seat;
    this.clear(seat);
    // A bot has no account either way, so its money is always made up.
    seat.purse = FUN_PURSE;
    return seat;
  }

  watch(socketId: string): void {
    this.seating.watch(socketId);
  }

  unwatch(socketId: string): void {
    this.seating.unwatch(socketId);
  }

  disconnect(seatId: string): void {
    const seat = this.seating.disconnect(seatId);
    if (seat === null) {
      return;
    }
    this.lastEvent = `${seat.name} dropped out`;
    // A hand does not wait for somebody who has gone.
    if (this.phase === "playing" && this.currentSeat()?.id === seatId) {
      const going = this.currentSeat() as Seat;
      going.done = true;
      this.advance();
    }
  }

  reconnect(seatId: string): Seat {
    return this.seating.reconnect(seatId) as Seat;
  }

  removeSeat(seatId: string): void {
    if (this.status !== "lobby") {
      return;
    }
    this.seating.remove(seatId);
  }

  /** Resets the hand. Never the purse: that outlives every hand at the table. */
  private clear(seat: Seat): void {
    seat.bet = 0;
    seat.cards = [];
    seat.done = false;
    seat.outcome = null;
    seat.returned = 0;
  }

  // -------------------------------------------------------------- the hand

  /**
   * Places a stake.
   *
   * The chips are taken by the caller rather than here. The table knows what
   * was staked; whose chips they were is the economy's business, and a table
   * that could move a balance would be a second place money is decided.
   */
  bet(seatId: string, amount: number): void {
    if (this.phase !== "betting") {
      // This also covers somebody who arrived mid-hand: a seat is only ever
      // waiting while a hand is running, and a hand that is running is not in
      // its betting phase. There is deliberately no second check for it — a
      // branch that cannot fire is worse than no branch, because it reads as
      // though the case were handled somewhere it is not.
      throw new TableError("The hand has already been dealt.");
    }
    const seat = this.seating.find(seatId) as Seat | undefined;
    if (seat === undefined) {
      throw new TableError("You are not at this table.");
    }
    /*
     * Zero is a bet: it is taking your chips back off the felt before the
     * cards come out. Without it a misclick would stand for the whole hand,
     * because every other amount here replaces the last one and there would be
     * no amount that meant none.
     */
    const withdrawn = amount === 0;
    if (!Number.isInteger(amount) || (!withdrawn && (amount < MIN_BET || amount > MAX_BET))) {
      throw new TableError(`Bets are between ${MIN_BET} and ${MAX_BET}.`);
    }
    /*
     * At a for-fun table the purse is the only thing stopping a bet, because
     * there is no account to ask. Whatever is already staked counts as
     * available: changing a bet is not spending twice.
     */
    if (this.forFun) {
      const available = seat.purse + seat.bet;
      if (amount > available) {
        throw new TableError("You do not have that many chips.");
      }
      seat.purse = available - amount;
    }

    seat.bet = amount;
    this.lastEvent = withdrawn
      ? `${seat.name} took their chips back`
      : `${seat.name} bet ${amount.toLocaleString("en-US")}`;
  }

  /** Deals the hand. The host's call, and only once somebody has bet. */
  deal(seatId: string): void {
    if (seatId !== this.hostId) {
      throw new TableError("Only the host can deal.");
    }
    if (this.phase !== "betting") {
      throw new TableError("That hand is already going.");
    }
    if (this.seats.length < MIN_SEATS) {
      throw new TableError("Somebody has to be at the table.");
    }
    const inHand = this.playing;
    if (inHand.length === 0) {
      throw new TableError("Nobody has bet yet.");
    }

    this.shoe.refresh();
    this.status = "playing";
    this.dealer = [];
    for (const seat of inHand) {
      seat.cards = [];
      seat.done = false;
      seat.outcome = null;
      seat.returned = 0;
    }

    // Two rounds, the way a dealer deals: everybody one, then everybody a second.
    for (let round = 0; round < 2; round += 1) {
      for (const seat of inHand) {
        seat.cards.push(this.shoe.draw());
      }
      this.dealer.push(this.shoe.draw());
    }

    // A blackjack is over before it begins.
    for (const seat of inHand) {
      if (isBlackjack(seat.cards)) {
        seat.done = true;
      }
    }

    this.phase = "playing";
    this.lastEvent = "Cards out";
    this.turnIndex = -1;
    this.advance();
  }

  currentSeat(): Seat | null {
    if (this.phase !== "playing" || this.turnIndex < 0) {
      return null;
    }
    return this.playing[this.turnIndex] ?? null;
  }

  hit(seatId: string): void {
    const seat = this.requireTurn(seatId);
    seat.cards.push(this.shoe.draw());
    const worth = value(seat.cards);
    if (worth.bust) {
      seat.done = true;
      seat.outcome = "bust";
      this.lastEvent = `${seat.name} bust on ${worth.total}`;
      this.advance();
      return;
    }
    if (worth.total === 21) {
      // Nothing left to decide at twenty-one.
      seat.done = true;
      this.advance();
    }
  }

  stand(seatId: string): void {
    const seat = this.requireTurn(seatId);
    seat.done = true;
    this.advance();
  }

  /**
   * Doubles the stake for exactly one more card.
   *
   * First two cards only, which is the rule everywhere and also the only point
   * at which doubling is a decision rather than a mistake. Returns the extra
   * chips owed, for the caller to take.
   */
  double(seatId: string): number {
    const seat = this.requireTurn(seatId);
    if (seat.cards.length !== 2) {
      throw new TableError("You can only double on your first two cards.");
    }
    const extra = seat.bet;
    if (this.forFun) {
      if (seat.purse < extra) {
        throw new TableError("You cannot cover a double.");
      }
      seat.purse -= extra;
    }
    seat.bet += extra;
    seat.cards.push(this.shoe.draw());
    seat.done = true;
    if (value(seat.cards).bust) {
      seat.outcome = "bust";
    }
    this.lastEvent = `${seat.name} doubled`;
    this.advance();
    return extra;
  }

  private requireTurn(seatId: string): Seat {
    const seat = this.currentSeat();
    if (seat === null || seat.id !== seatId) {
      throw new TableError("It is not your turn.");
    }
    if (seat.done) {
      throw new TableError("You are done for this hand.");
    }
    return seat;
  }

  /** On to the next player with a decision left, or to the dealer. */
  private advance(): void {
    const inHand = this.playing;
    for (let next = this.turnIndex + 1; next < inHand.length; next += 1) {
      const seat = inHand[next] as Seat;
      if (!seat.done && seat.connected) {
        this.turnIndex = next;
        return;
      }
    }
    this.turnIndex = -1;
    this.playDealer();
  }

  /**
   * The dealer's turn, which is not a decision — the rules play it.
   *
   * Skipped entirely when everybody has bust: there is nothing left to beat,
   * and dealing the house cards it does not need only invites an argument
   * about what it drew.
   */
  private playDealer(): void {
    this.phase = "dealer";
    const contenders = this.playing.filter((seat) => seat.outcome !== "bust");
    if (contenders.length > 0) {
      while (value(this.dealer).total < DEALER_STANDS) {
        this.dealer.push(this.shoe.draw());
      }
    }
    this.settle();
  }

  private settle(): void {
    const dealer = value(this.dealer);
    const dealerBlackjack = isBlackjack(this.dealer);

    for (const seat of this.playing) {
      const mine = value(seat.cards);

      if (seat.outcome === "bust") {
        // Already lost, and lost before the dealer drew: the house keeps it
        // whatever happens next, which is the whole edge.
        seat.returned = 0;
        continue;
      }

      if (isBlackjack(seat.cards)) {
        if (dealerBlackjack) {
          seat.outcome = "push";
          seat.returned = seat.bet;
        } else {
          // Three to two, with the stake back alongside it.
          seat.outcome = "blackjack";
          seat.returned = seat.bet + Math.floor(seat.bet * 1.5);
        }
        continue;
      }

      if (dealerBlackjack || (!dealer.bust && dealer.total > mine.total)) {
        seat.outcome = "lost";
        seat.returned = 0;
        continue;
      }

      if (!dealer.bust && dealer.total === mine.total) {
        seat.outcome = "push";
        seat.returned = seat.bet;
        continue;
      }

      seat.outcome = "won";
      seat.returned = seat.bet * 2;
    }

    /*
     * Play money is paid here rather than by the adapter, because there is
     * nobody to ask: the economy never hears about a for-fun table, so the
     * table is the only thing that can hand anything back.
     */
    if (this.forFun) {
      for (const seat of this.playing) {
        seat.purse += seat.returned;
      }
    }

    this.phase = "settled";
    this.status = "over";
    this.lastEvent = dealer.bust ? `Dealer bust on ${dealer.total}` : `Dealer has ${dealer.total}`;
  }

  /** Clears the table for another hand, keeping everyone at it. */
  nextHand(seatId: string): void {
    if (seatId !== this.hostId) {
      throw new TableError("Only the host can deal another hand.");
    }
    if (this.phase !== "settled") {
      throw new TableError("That hand is still going.");
    }
    for (const seat of this.seats) {
      this.clear(seat);
      /*
       * Topped back up rather than shown the door. There is nothing to protect
       * at a table playing for nothing — the point of play money is that
       * losing it costs nothing — so running out should end a hand, not the
       * evening.
       */
      if (this.forFun && seat.purse < MIN_BET) {
        seat.purse = FUN_PURSE;
      }
    }
    this.seating.dealInWaiting();
    this.dealer = [];
    this.phase = "betting";
    this.status = "lobby";
    this.turnIndex = -1;
    this.lastEvent = "Place your bets";
  }

  // -------------------------------------------------------------- the view

  /**
   * The table as one seat may see it.
   *
   * The dealer's second card is not in this until the dealer plays. It is left
   * out here rather than hidden in the browser, because a card that reaches
   * the client has been dealt to everybody whatever the markup says — which is
   * the entire reason the server learned to describe a table per seat.
   */
  view(_forSeatId: string | null = null): TableView {
    const hidden = this.phase === "betting" || this.phase === "playing";
    const shown = hidden ? this.dealer.slice(0, 1) : this.dealer;
    const current = this.currentSeat();

    return {
      code: this.code,
      status: this.status,
      phase: this.phase,
      hostId: this.hostId,
      watching: this.seating.watching,
      lastEvent: this.lastEvent,
      turnSeatId: current?.id ?? null,
      minBet: MIN_BET,
      maxBet: MAX_BET,
      forFun: this.forFun,
      dealer: {
        cards: shown,
        total: value(shown).total,
        hidden: hidden && this.dealer.length > 1,
      },
      seats: this.seats.map((seat) => {
        const worth = value(seat.cards);
        return {
          id: seat.id,
          name: seat.name,
          connected: seat.connected,
          waiting: seat.waiting,
          isBot: seat.isBot,
          avatar: seat.avatar,
          accentColor: seat.accentColor,
          bet: seat.bet,
          cards: seat.cards,
          total: worth.total,
          soft: worth.soft,
          bust: worth.bust,
          done: seat.done,
          outcome: seat.outcome,
          returned: seat.returned,
          purse: seat.purse,
        };
      }),
    };
  }
}
