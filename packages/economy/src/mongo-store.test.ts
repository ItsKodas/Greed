import { afterAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoStore } from "./mongo-store.js";
import { DAILY_GRANT, STARTING_CHIPS } from "./store.js";

/**
 * These need a real mongod, so they are skipped unless one is pointed at:
 *
 *   docker run -d --name greed-test-mongo -p 27018:27017 mongo:7
 *   MONGO_TEST_URL=mongodb://localhost:27018/greed-test npm test
 *
 * What they are for is the handful of promises MemoryStore cannot keep on its
 * behalf. MemoryStore is single-threaded, so a read-then-write there is atomic
 * by accident; the Mongo implementation deliberately expresses each of these
 * as one conditional update, and the only way to show that it worked is to run
 * concurrent callers against a real database.
 */
const url = process.env["MONGO_TEST_URL"];

describe.skipIf(url === undefined || url.length === 0)("MongoStore against a real database", () => {
  let store: MongoStore;
  let seq = 0;

  afterAll(async () => {
    await store?.close();
  });

  /** A fresh player per test, so tests cannot bleed into one another. */
  async function newPlayer() {
    seq += 1;
    store ??= await MongoStore.connect(url as string);
    return store.upsertDiscordUser({
      discordId: `test-${Date.now()}-${seq}`,
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
  }

  beforeEach(async () => {
    store ??= await MongoStore.connect(url as string);
  });

  it("opens a new profile with the starting stack", async () => {
    expect((await newPlayer()).chips).toBe(STARTING_CHIPS);
  });

  it("keeps a balance across sign-ins and takes the newer name", async () => {
    const first = await newPlayer();
    await store.adjustChips(first.id, -4000);
    const again = await store.upsertDiscordUser({
      discordId: first.discordId,
      name: "Ada Renamed",
      avatar: null,
      accentColor: null,
    });
    expect(again.chips).toBe(STARTING_CHIPS - 4000);
    expect(again.name).toBe("Ada Renamed");
  });

  it("never overdraws, however many debits race", async () => {
    const player = await newPlayer();
    // Twenty concurrent 1,000-chip debits against a 10,000 stack. A
    // read-then-write would let more than ten through and end up negative.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.adjustChips(player.id, -1000)),
    );
    expect(results.filter(Boolean)).toHaveLength(STARTING_CHIPS / 1000);
    expect((await store.get(player.id))?.chips).toBe(0);
  });

  it("pays the daily top-up once even when claimed concurrently", async () => {
    const player = await newPlayer();
    await store.adjustChips(player.id, -(STARTING_CHIPS - 50));

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => store.claimDaily(player.id)),
    );
    expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
    expect((await store.get(player.id))?.chips).toBe(50 + DAILY_GRANT);
  });

  it("refuses the top-up to someone who is not short", async () => {
    const player = await newPlayer();
    const claim = await store.claimDaily(player.id);
    expect(claim.ok).toBe(false);
  });

  it("holds the best turn as a high-water mark under racing writes", async () => {
    const player = await newPlayer();
    await Promise.all(
      [400, 1200, 800].map((bestTurn) =>
        store.bumpStats(player.id, { game: "greed", max: { bestTurn } }),
      ),
    );
    expect((await store.get(player.id))?.byGame["greed"]?.["bestTurn"]).toBe(1200);
  });

  it("adds up the counting stats rather than overwriting them", async () => {
    const player = await newPlayer();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        store.bumpStats(player.id, { game: "greed", add: { farkles: 1 } }),
      ),
    );
    expect((await store.get(player.id))?.byGame["greed"]?.["farkles"]).toBe(6);
  });

  it("returns games newest first, no more than asked for", async () => {
    const player = await newPlayer();
    const at = Date.now();
    for (const [index, endedAt] of [at - 3000, at - 1000, at - 2000].entries()) {
      await store.recordGame({
        code: `GAME${index}`,
        rulesetName: "Classic",
        buyIn: 500,
        pot: 1000,
        players: [{ userId: player.id, name: "Ada", score: 10_000, isBot: false }],
        winnerIds: [player.id],
        endedAt,
      });
    }
    const recent = await store.recentGames(player.id, 2);
    expect(recent.map((game) => game.endedAt)).toEqual([at - 1000, at - 2000]);
  });

  it("does not hand a player someone else's history", async () => {
    const mine = await newPlayer();
    const theirs = await newPlayer();
    await store.recordGame({
      code: "OTHER",
      rulesetName: "Classic",
      buyIn: 0,
      pot: 0,
      players: [{ userId: theirs.id, name: "Bob", score: 5000, isBot: false }],
      winnerIds: [theirs.id],
      endedAt: Date.now(),
    });
    expect(await store.recentGames(mine.id, 10)).toHaveLength(0);
  });

  it("lifts dice figures out of a profile written before the split", async () => {
    /*
     * A profile from when there was one game: bestTurn, farkles and hotDice
     * sat in the shared stats, because everything was Greed. Connecting moves
     * them under the game's own name, once, and leaves the shared totals be.
     */
    const legacy = {
      discordId: `legacy-${Date.now()}`,
      name: "Ada",
      avatar: null,
      accentColor: null,
      chips: 7000,
      lastDailyClaim: null,
      stats: { games: 9, wins: 4, chipsWon: 1200, bestTurn: 3050, farkles: 62, hotDice: 11 },
    };
    const direct = await mongoose.createConnection(url as string).asPromise();
    const inserted = await direct.collection("users").insertOne(legacy);
    await direct.close();

    // Connecting is what runs the migration.
    const migrated = await MongoStore.connect(url as string);
    const person = await migrated.get(inserted.insertedId.toString());
    await migrated.close();

    expect(person?.byGame["greed"]).toEqual({ bestTurn: 3050, farkles: 62, hotDice: 11 });
    expect(person?.stats).toEqual({ games: 9, wins: 4, chipsWon: 1200 });
    expect(person?.chips).toBe(7000);
  });
});
