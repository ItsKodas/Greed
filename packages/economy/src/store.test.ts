import { describe, expect, it } from "vitest";
import {
  DAILY_FLOOR,
  DAILY_GRANT,
  MemoryStore,
  STARTING_CHIPS,
  emptyStats,
  judgeDaily,
} from "./store.js";
import type { Profile } from "./store.js";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    discordId: "d1",
    name: "Ada",
    avatar: null,
    accentColor: null,
    chips: STARTING_CHIPS,
    lastDailyClaim: null,
    stats: emptyStats(),
    byGame: {},
    ...overrides,
  };
}

describe("the daily top-up rule", () => {
  it("is refused while a player still has chips", () => {
    const verdict = judgeDaily(profile({ chips: DAILY_FLOOR }), Date.now());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("not-needed");
  });

  it("is granted to someone who has run dry", () => {
    const verdict = judgeDaily(profile({ chips: 50 }), Date.now());
    expect(verdict.ok).toBe(true);
    expect(verdict.granted).toBe(DAILY_GRANT);
  });

  it("cannot be claimed twice in a day", () => {
    const now = Date.now();
    const verdict = judgeDaily(profile({ chips: 50, lastDailyClaim: now - 1000 }), now);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("too-soon");
    expect(verdict.nextAt).toBeGreaterThan(now);
  });

  it("comes round again after the interval", () => {
    const now = Date.now();
    const longAgo = now - 25 * 60 * 60 * 1000;
    expect(judgeDaily(profile({ chips: 50, lastDailyClaim: longAgo }), now).ok).toBe(true);
  });
});

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
    expect(person.stats).toEqual({ games: 0, wins: 0, chipsWon: 0 });
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
    expect(after?.stats).toEqual({ games: 2, wins: 1, chipsWon: 300 });
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
