import { describe, expect, it } from "vitest";
import { MemoryStore, STARTING_CHIPS } from "./store.js";

describe("the memory store", () => {
  it("starts a new profile with the opening stack", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(person.chips).toBe(STARTING_CHIPS);
  });

  it("does not reset a balance when the same player signs in again", async () => {
    const store = new MemoryStore();
    const first = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    await store.adjustChips(first.id, -4000);
    const again = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada Renamed",
      avatar: null,
      accentColor: null,
    });
    expect(again.chips).toBe(STARTING_CHIPS - 4000);
    expect(again.name).toBe("Ada Renamed");
  });

  it("refuses to overdraw rather than going negative", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(await store.adjustChips(person.id, -(STARTING_CHIPS + 1))).toBe(false);
    expect((await store.get(person.id))?.chips).toBe(STARTING_CHIPS);
  });

  it("starts a profile with no figures for any game", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(person.stats).toEqual({ games: 0, wins: 0, chipsWon: 0, chipsStaked: 0 });
    expect(person.byGame).toEqual({});
  });
});

describe("figures a game keeps for itself", () => {
  it("files them under the game that sent them", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    await store.bumpStats(person.id, {
      shared: { games: 1, wins: 1, chipsWon: 500 },
      game: "greed",
      add: { farkles: 2 },
      max: { bestTurn: 800 },
    });
    await store.bumpStats(person.id, {
      shared: { games: 1, wins: 0, chipsWon: -200 },
      game: "blackjack",
      add: { busts: 1 },
    });

    const after = await store.get(person.id);
    // The shared totals count both games; neither game sees the other's words.
    expect(after?.stats).toEqual({ games: 2, wins: 1, chipsWon: 300, chipsStaked: 0 });
    expect(after?.byGame["greed"]).toEqual({ farkles: 2, bestTurn: 800 });
    expect(after?.byGame["blackjack"]).toEqual({ busts: 1 });
  });

  it("keeps a maximum as a maximum and a count as a count", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    for (const bestTurn of [800, 400, 650]) {
      await store.bumpStats(person.id, { game: "greed", max: { bestTurn }, add: { farkles: 1 } });
    }
    const after = await store.get(person.id);
    expect(after?.byGame["greed"]?.["bestTurn"]).toBe(800);
    expect(after?.byGame["greed"]?.["farkles"]).toBe(3);
  });
});

describe("chips staked", () => {
  it("starts at nothing and sums like the other shared totals", async () => {
    const store = new MemoryStore();
    const player = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(player.stats.chipsStaked).toBe(0);

    await store.bumpStats(player.id, { shared: { games: 1, wins: 0, chipsWon: -50, chipsStaked: 50 } });
    await store.bumpStats(player.id, { shared: { games: 1, wins: 1, chipsWon: 30, chipsStaked: 20 } });

    const after = await store.get(player.id);
    expect(after?.stats.chipsStaked).toBe(70);
    // The net is still a net: it went down fifty and up thirty.
    expect(after?.stats.chipsWon).toBe(-20);
  });
});

describe("the house bank", () => {
  it("starts empty, because nobody has played yet", async () => {
    const store = new MemoryStore();
    expect(await store.bank("slots")).toBe(0);
  });

  it("holds what is put into it", async () => {
    const store = new MemoryStore();
    await store.bankAdd("slots", 500);
    await store.bankAdd("slots", 250);
    expect(await store.bank("slots")).toBe(750);
  });

  it("pays out what it holds", async () => {
    const store = new MemoryStore();
    await store.bankAdd("slots", 500);
    expect(await store.bankTake("slots", 200)).toBe(true);
    expect(await store.bank("slots")).toBe(300);
  });

  it("refuses rather than going negative", async () => {
    /*
     * The last line of defence, and the reason it is worth having even though
     * the stake cap should make it unreachable: a bug upstream becomes a
     * refused payout that somebody notices, rather than a bank quietly gone
     * negative and a machine that has started minting chips.
     */
    const store = new MemoryStore();
    await store.bankAdd("slots", 100);
    expect(await store.bankTake("slots", 101)).toBe(false);
    expect(await store.bank("slots")).toBe(100);
  });

  it("lets a payout take the bank to exactly nothing", async () => {
    const store = new MemoryStore();
    await store.bankAdd("slots", 100);
    expect(await store.bankTake("slots", 100)).toBe(true);
    expect(await store.bank("slots")).toBe(0);
  });
});
