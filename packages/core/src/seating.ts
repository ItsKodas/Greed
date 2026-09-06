import { MAX_NAME, MAX_SEATS, TableError } from "./types.js";
import type { BotSkill, Seat, SeatIdentity, TableStatus } from "./types.js";

/**
 * Who is at a table.
 *
 * Every game needs the same answers — who is here, who is host, who dropped
 * out, who is only watching, who turned up too late — and none of those
 * answers depend on what is being played. Keeping them in one place means a
 * new game inherits reconnection, host succession and the full-table rule
 * rather than reimplementing them slightly differently.
 *
 * Deliberately not a base class. A game owns its seating rather than being a
 * kind of it, because the interesting part of a game is never the seating.
 */
export class Seating {
  readonly seats: Seat[] = [];
  /**
   * Sockets watching without a seat. Held by socket rather than by person:
   * watching is something a connection does, not something an account is, and
   * it should not outlive the tab it happens in.
   */
  private readonly watchers = new Set<string>();

  /** The first seat still holds the table, so hosting survives a reconnect. */
  get hostId(): string | null {
    return this.seats[0]?.id ?? null;
  }

  /** Nobody is here any more. Watchers do not count; eyes are not seats. */
  get isEmpty(): boolean {
    return this.seats.every((seat) => !seat.connected);
  }

  get watching(): number {
    return this.watchers.size;
  }

  find(seatId: string): Seat | undefined {
    return this.seats.find((seat) => seat.id === seatId);
  }

  /**
   * Sits somebody down.
   *
   * @param status What the table is doing, which decides whether they are in
   * this game or the next one.
   */
  join(
    id: string,
    name: string,
    status: TableStatus,
    identity: SeatIdentity | null = null,
    requireIdentity = false,
  ): Seat {
    if (this.seats.length >= MAX_SEATS) {
      throw new TableError("That table is full.");
    }
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (trimmed.length === 0) {
      throw new TableError("Pick a name first.");
    }
    if (requireIdentity && identity === null) {
      throw new TableError("That table is playing for chips — sign in first.");
    }
    const seat: Seat = {
      id,
      name: trimmed,
      connected: true,
      // A table in its lobby deals everyone in; one already playing does not.
      waiting: status !== "lobby",
      isBot: false,
      skill: null,
      userId: identity?.userId ?? null,
      avatar: identity?.avatar ?? null,
      accentColor: identity?.accentColor ?? null,
    };
    this.seats.push(seat);
    return seat;
  }

  addBot(id: string, name: string, skill: BotSkill): Seat {
    if (this.seats.length >= MAX_SEATS) {
      throw new TableError("That table is full.");
    }
    const seat: Seat = {
      id,
      name,
      connected: true,
      waiting: false,
      isBot: true,
      skill,
      userId: null,
      avatar: null,
      accentColor: null,
    };
    this.seats.push(seat);
    return seat;
  }

  /** Marks a seat as gone without giving it up. Returns it, if it was there. */
  disconnect(seatId: string): Seat | null {
    const seat = this.find(seatId);
    if (seat === undefined) {
      return null;
    }
    seat.connected = false;
    return seat;
  }

  reconnect(seatId: string): Seat {
    const seat = this.find(seatId);
    if (seat === undefined) {
      throw new TableError("That seat is gone.");
    }
    seat.connected = true;
    return seat;
  }

  /**
   * Gives up on a seat for good.
   *
   * Only safe in a lobby, and the caller is trusted to know that: removing a
   * seat mid-game shifts every later seat's index out from under whatever the
   * game is using to track turn order.
   */
  remove(seatId: string): Seat | null {
    const index = this.seats.findIndex((seat) => seat.id === seatId);
    if (index === -1) {
      return null;
    }
    const [seat] = this.seats.splice(index, 1);
    return seat ?? null;
  }

  /** Deals in everyone who was waiting for the next game. */
  dealInWaiting(): void {
    for (const seat of this.seats) {
      seat.waiting = false;
    }
  }

  watch(socketId: string): void {
    this.watchers.add(socketId);
  }

  unwatch(socketId: string): void {
    this.watchers.delete(socketId);
  }
}
