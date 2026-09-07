import { describe, expect, it } from "vitest";
import { Seating } from "./seating.js";
import { MAX_SEATS, MIN_TABLE_SEATS, seatLimit, TableError } from "./types.js";

function identity(userId: string) {
  return { userId, avatar: null, accentColor: null };
}

describe("who is at a table", () => {
  it("makes the first person to sit down the host", () => {
    const seating = new Seating();
    expect(seating.hostId).toBeNull();
    seating.join("a", "Ada", "lobby");
    seating.join("b", "Bo", "lobby");
    expect(seating.hostId).toBe("a");
  });

  it("keeps hosting with the seat, not the connection", () => {
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    seating.join("b", "Bo", "lobby");
    seating.disconnect("a");
    // Still theirs: the seat is held open for a refresh, and so is the table.
    expect(seating.hostId).toBe("a");
    seating.reconnect("a");
    expect(seating.hostId).toBe("a");
  });

  it("passes the table on when the host gives up their seat", () => {
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    seating.join("b", "Bo", "lobby");
    seating.remove("a");
    expect(seating.hostId).toBe("b");
  });

  it("tidies a name and refuses an empty one", () => {
    const seating = new Seating();
    expect(seating.join("a", "  Ada  ", "lobby").name).toBe("Ada");
    expect(seating.join("b", "x".repeat(50), "lobby").name).toHaveLength(20);
    expect(() => seating.join("c", "   ", "lobby")).toThrow(TableError);
  });

  it("fills up", () => {
    const seating = new Seating();
    for (let index = 0; index < MAX_SEATS; index += 1) {
      seating.join(`s${index}`, `P${index}`, "lobby");
    }
    expect(() => seating.join("extra", "Late", "lobby")).toThrow(/full/i);
  });

  it("asks for an account only when the table wants one", () => {
    const seating = new Seating();
    expect(() => seating.join("a", "Ada", "lobby", null, true)).toThrow(/sign in/i);
    expect(seating.join("b", "Bo", "lobby", identity("u1"), true).userId).toBe("u1");
    // A free table takes anyone.
    expect(seating.join("c", "Cy", "lobby", null, false).userId).toBeNull();
  });

  it("seats a latecomer for the next game", () => {
    const seating = new Seating();
    expect(seating.join("a", "Ada", "lobby").waiting).toBe(false);
    expect(seating.join("b", "Bo", "playing").waiting).toBe(true);
    expect(seating.join("c", "Cy", "over").waiting).toBe(true);

    seating.dealInWaiting();
    expect(seating.seats.every((seat) => !seat.waiting)).toBe(true);
  });

  it("is empty when nobody is connected, however many seats remain", () => {
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    expect(seating.isEmpty).toBe(false);
    seating.disconnect("a");
    expect(seating.isEmpty).toBe(true);
  });

  it("is empty when only bots are left, however connected they look", () => {
    /*
     * A bot is connected from the moment it is seated and has no connection to
     * lose, so counting it would keep a table occupied for as long as the
     * process lived — dealing hands to nobody, on the clock. A table is empty
     * when the last person leaves it, whoever is still sitting there.
     */
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    seating.addBot("bot:1", "Vera", "normal");
    expect(seating.isEmpty).toBe(false);

    seating.disconnect("a");
    expect(seating.isEmpty).toBe(true);
  });

  it("is empty when the table was only ever bots", () => {
    const seating = new Seating();
    seating.addBot("bot:1", "Vera", "hard");
    seating.addBot("bot:2", "Otto", "easy");
    expect(seating.isEmpty).toBe(true);
  });

  it("counts watchers separately, and they never make it un-empty", () => {
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    seating.disconnect("a");
    seating.watch("socket-1");
    seating.watch("socket-2");
    seating.watch("socket-1"); // the same eyes twice

    expect(seating.watching).toBe(2);
    // Eyes are not seats: a table nobody is sitting at is still abandoned.
    expect(seating.isEmpty).toBe(true);

    seating.unwatch("socket-1");
    expect(seating.watching).toBe(1);
  });

  it("refuses to bring back a seat that is gone", () => {
    const seating = new Seating();
    expect(() => seating.reconnect("nobody")).toThrow(TableError);
  });

  it("seats bots without an account and never as waiting", () => {
    const seating = new Seating();
    seating.join("a", "Ada", "lobby");
    const bot = seating.addBot("bot-1", "Ruby", "hard");
    expect(bot.isBot).toBe(true);
    expect(bot.skill).toBe("hard");
    expect(bot.userId).toBeNull();
    expect(bot.waiting).toBe(false);
  });
});

describe("how big a table the host asked for", () => {
  it("seats exactly as many as it was opened for, and no more", () => {
    const seating = new Seating(4);
    for (let index = 0; index < 4; index += 1) {
      seating.join(`s${index}`, `P${index}`, "lobby");
    }

    expect(seating.seats).toHaveLength(4);
    expect(() => seating.join("late", "Late", "lobby")).toThrow(/full/i);
  });

  it("never seats more than the house allows, whatever was asked for", () => {
    // The number arrives from a client, so the ceiling is not negotiable.
    expect(new Seating(400).limit).toBe(MAX_SEATS);
    expect(seatLimit(400)).toBe(MAX_SEATS);
  });

  it("treats one seat, none, and nonsense as no answer at all", () => {
    /*
     * A table that will not open is a worse answer than a table with room for
     * everybody, so anything unusable becomes the ceiling rather than an error.
     */
    expect(seatLimit(1)).toBe(MIN_TABLE_SEATS);
    expect(seatLimit(0)).toBe(MIN_TABLE_SEATS);
    expect(seatLimit(-5)).toBe(MIN_TABLE_SEATS);
    expect(seatLimit(undefined)).toBe(MAX_SEATS);
    expect(seatLimit("six")).toBe(MAX_SEATS);
    expect(seatLimit(4.5)).toBe(MAX_SEATS);
  });

  it("cannot be talked past a game's own smaller ceiling", () => {
    expect(seatLimit(10, 6)).toBe(6);
    expect(seatLimit(4, 6)).toBe(4);
  });

  it("holds bots to the same limit as people", () => {
    const seating = new Seating(2);
    seating.join("a", "Ada", "lobby");
    seating.addBot("bot", "Cassie", "normal");

    expect(() => seating.addBot("bot2", "Dot", "normal")).toThrow(/full/i);
  });
});
