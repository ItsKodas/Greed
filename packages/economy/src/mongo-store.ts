import mongoose from "mongoose";
import type { Model } from "mongoose";
import {
  DAILY_FLOOR,
  DAILY_GRANT,
  DAILY_INTERVAL_MS,
  STARTING_CHIPS,
  emptyStats,
} from "./store.js";
import type {
  DailyResult,
  GameRecord,
  Profile,
  ProfileStats,
  StatBump,
  Store,
} from "./store.js";

interface UserDoc {
  _id: mongoose.Types.ObjectId;
  discordId: string;
  name: string;
  avatar: string | null;
  accentColor: number | null;
  chips: number;
  lastDailyClaim: Date | null;
  stats: ProfileStats;
  byGame: Record<string, Record<string, number>>;
}

const statsSchema = new mongoose.Schema<ProfileStats>(
  {
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    chipsWon: { type: Number, default: 0 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema<UserDoc>(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    avatar: { type: String, default: null },
    accentColor: { type: Number, default: null },
    chips: { type: Number, default: STARTING_CHIPS },
    lastDailyClaim: { type: Date, default: null },
    stats: { type: statsSchema, default: () => emptyStats() },
    // Free-form on purpose: each game names its own figures and the store has
    // no business knowing what they are called.
    byGame: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
);

const gameSchema = new mongoose.Schema<GameRecord>(
  {
    code: String,
    rulesetName: String,
    buyIn: Number,
    pot: Number,
    players: [
      {
        _id: false,
        userId: { type: String, default: null },
        name: String,
        score: Number,
        isBot: Boolean,
      },
    ],
    winnerIds: [String],
    endedAt: Number,
  },
  { timestamps: true },
);
gameSchema.index({ "players.userId": 1, endedAt: -1 });

function toProfile(doc: UserDoc): Profile {
  return {
    id: doc._id.toString(),
    discordId: doc.discordId,
    name: doc.name,
    avatar: doc.avatar,
    accentColor: doc.accentColor,
    chips: doc.chips,
    lastDailyClaim: doc.lastDailyClaim === null ? null : doc.lastDailyClaim.getTime(),
    /*
     * Copied field by field rather than handed straight out. What Mongoose
     * stores on the document is a live subdocument, not the plain object the
     * Profile type promises — it carries a prototype and its own machinery, so
     * it compares unequal to an identical-looking object and lets callers write
     * back through it by accident.
     */
    stats: {
      games: doc.stats?.games ?? 0,
      wins: doc.stats?.wins ?? 0,
      chipsWon: doc.stats?.chipsWon ?? 0,
    },
    byGame: structuredClone(doc.byGame ?? {}),
  };
}

export class MongoStore implements Store {
  readonly kind = "mongo" as const;
  private readonly users: Model<UserDoc>;
  private readonly games: Model<GameRecord>;

  private constructor(private readonly connection: mongoose.Connection) {
    this.users = connection.model<UserDoc>("User", userSchema);
    this.games = connection.model<GameRecord>("Game", gameSchema);
  }

  /**
   * Moves Greed's figures out of the shared profile and under its own name.
   *
   * `bestTurn`, `farkles` and `hotDice` were three of the six things a player
   * was, back when there was one game. Every profile written before that
   * changed still has them there, so they are lifted across once. Runs on
   * connect, touches only documents that still carry them, and is safe to run
   * again — after the first pass the filter matches nothing.
   */
  private static async liftGreedFigures(connection: mongoose.Connection): Promise<void> {
    const users = connection.collection("users");
    const stale = { "stats.bestTurn": { $exists: true } };
    if ((await users.countDocuments(stale, { limit: 1 })) === 0) {
      return;
    }
    const result = await users.updateMany(stale, [
      {
        $set: {
          "byGame.greed": {
            bestTurn: { $ifNull: ["$stats.bestTurn", 0] },
            farkles: { $ifNull: ["$stats.farkles", 0] },
            hotDice: { $ifNull: ["$stats.hotDice", 0] },
          },
        },
      },
      { $unset: ["stats.bestTurn", "stats.farkles", "stats.hotDice"] },
    ]);
    console.log(`greed: moved dice figures on ${result.modifiedCount} profile(s)`);
  }

  static async connect(url: string): Promise<MongoStore> {
    const connection = await mongoose
      .createConnection(url, {
        // Mongoose waits thirty seconds by default before admitting it cannot
        // find a server. The caller treats an unreachable database as a reason
        // to run in memory rather than to stop, and a server that will not
        // answer for half a minute is not available either way — so give up
        // quickly and get on with dealing the cards.
        serverSelectionTimeoutMS: 5_000,
      })
      .asPromise();
    await MongoStore.liftGreedFigures(connection);
    return new MongoStore(connection);
  }

  async upsertDiscordUser(input: {
    discordId: string;
    name: string;
    avatar: string | null;
    accentColor: number | null;
  }): Promise<Profile> {
    const doc = await this.users.findOneAndUpdate(
      { discordId: input.discordId },
      {
        $set: { name: input.name, avatar: input.avatar, accentColor: input.accentColor },
        // Only on insert, so signing in again never resets a balance.
        $setOnInsert: {
          chips: STARTING_CHIPS,
          lastDailyClaim: null,
          stats: emptyStats(),
          byGame: {},
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return toProfile(doc);
  }

  async get(id: string): Promise<Profile | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.users.findById(id);
    return doc === null ? null : toProfile(doc);
  }

  /**
   * One conditional update rather than a read then a write, so two games
   * settling at once cannot overdraw the same balance. No transaction, and so
   * no replica set needed to run this locally.
   */
  async adjustChips(id: string, delta: number): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return false;
    }
    const filter =
      delta < 0 ? { _id: id, chips: { $gte: Math.abs(delta) } } : { _id: id };
    const result = await this.users.updateOne(filter, { $inc: { chips: delta } });
    return result.modifiedCount === 1;
  }

  async claimDaily(id: string): Promise<DailyResult> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false, reason: "unknown-player", granted: 0, chips: 0 };
    }
    const cutoff = new Date(Date.now() - DAILY_INTERVAL_MS);
    // The whole rule expressed as the filter, so two clicks cannot both pay.
    const doc = await this.users.findOneAndUpdate(
      {
        _id: id,
        chips: { $lt: DAILY_FLOOR },
        $or: [{ lastDailyClaim: null }, { lastDailyClaim: { $lte: cutoff } }],
      },
      { $inc: { chips: DAILY_GRANT }, $set: { lastDailyClaim: new Date() } },
      { returnDocument: "after" },
    );
    if (doc !== null) {
      return { ok: true, granted: DAILY_GRANT, chips: doc.chips };
    }
    const current = await this.users.findById(id);
    if (current === null) {
      return { ok: false, reason: "unknown-player", granted: 0, chips: 0 };
    }
    if (current.chips >= DAILY_FLOOR) {
      return { ok: false, reason: "not-needed", granted: 0, chips: current.chips };
    }
    return {
      ok: false,
      reason: "too-soon",
      granted: 0,
      chips: current.chips,
      nextAt: (current.lastDailyClaim?.getTime() ?? 0) + DAILY_INTERVAL_MS,
    };
  }

  async bumpStats(id: string, bump: StatBump): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return;
    }
    const inc: Record<string, number> = {};
    const max: Record<string, number> = {};

    for (const [key, value] of Object.entries(bump.shared ?? {})) {
      if (typeof value === "number") {
        inc[`stats.${key}`] = value;
      }
    }
    if (bump.game !== undefined) {
      // The game's own figures, filed under its name. Mongo creates the path
      // on the way in, so a game's first figure needs no setup.
      for (const [key, value] of Object.entries(bump.add ?? {})) {
        inc[`byGame.${bump.game}.${key}`] = value;
      }
      for (const [key, value] of Object.entries(bump.max ?? {})) {
        max[`byGame.${bump.game}.${key}`] = value;
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(inc).length > 0) {
      update["$inc"] = inc;
    }
    if (Object.keys(max).length > 0) {
      update["$max"] = max;
    }
    if (Object.keys(update).length > 0) {
      await this.users.updateOne({ _id: id }, update);
    }
  }


  async recordGame(record: GameRecord): Promise<void> {
    await this.games.create(record);
  }

  async recentGames(userId: string, limit: number): Promise<GameRecord[]> {
    const docs = await this.games
      .find({ "players.userId": userId })
      .sort({ endedAt: -1 })
      .limit(limit)
      .lean();
    return docs as unknown as GameRecord[];
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}
