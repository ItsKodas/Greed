import mongoose from "mongoose";
import type { Model } from "mongoose";
import {
  DAILY_FLOOR,
  DAILY_GRANT,
  DAILY_INTERVAL_MS,
  STARTING_CHIPS,
  emptyStats,
} from "./store.js";
import type { DailyResult, GameRecord, Profile, ProfileStats, Store } from "./store.js";

interface UserDoc {
  _id: mongoose.Types.ObjectId;
  discordId: string;
  name: string;
  avatar: string | null;
  accentColor: number | null;
  chips: number;
  lastDailyClaim: Date | null;
  stats: ProfileStats;
}

const statsSchema = new mongoose.Schema<ProfileStats>(
  {
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    chipsWon: { type: Number, default: 0 },
    bestTurn: { type: Number, default: 0 },
    farkles: { type: Number, default: 0 },
    hotDice: { type: Number, default: 0 },
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
    stats: doc.stats,
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
        $setOnInsert: { chips: STARTING_CHIPS, lastDailyClaim: null, stats: emptyStats() },
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

  async bumpStats(id: string, changes: Partial<ProfileStats>): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return;
    }
    const inc: Record<string, number> = {};
    const max: Record<string, number> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (typeof value !== "number") {
        continue;
      }
      // A best is a high-water mark, not a running total.
      if (key === "bestTurn") {
        max["stats.bestTurn"] = value;
      } else {
        inc[`stats.${key}`] = value;
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
