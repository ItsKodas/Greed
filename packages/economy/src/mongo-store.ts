import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { judgeCode, mintCodeText, normaliseCode } from "./codes.js";
import type { CodeRecord, RedeemResult } from "./codes.js";
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

const codeSchema = new mongoose.Schema<CodeRecord>(
  {
    /* Stored without dashes and upper-cased, so how somebody types it is
       their business and not the database's. */
    code: { type: String, required: true, unique: true, index: true },
    chips: { type: Number, required: true },
    maxRedemptions: { type: Number, default: null },
    redemptions: { type: Number, default: 0 },
    expiresAt: { type: Number, default: null },
    note: { type: String, default: "" },
    createdBy: { type: String, required: true },
    createdAt: { type: Number, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: false },
);

interface RedemptionDoc {
  code: string;
  userId: string;
  chips: number;
  at: number;
}

const redemptionSchema = new mongoose.Schema<RedemptionDoc>({
  code: { type: String, required: true },
  userId: { type: String, required: true },
  chips: { type: Number, required: true },
  at: { type: Number, required: true },
});
/*
 * The one-each rule, enforced by the database rather than checked by the
 * server. A check followed by a write is a race by construction, and two
 * clicks a millisecond apart is the ordinary case here, not an exotic one.
 */
redemptionSchema.index({ code: 1, userId: 1 }, { unique: true });

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
  private readonly codes: Model<CodeRecord>;
  private readonly redemptions: Model<RedemptionDoc>;

  private constructor(private readonly connection: mongoose.Connection) {
    this.users = connection.model<UserDoc>("User", userSchema);
    this.games = connection.model<GameRecord>("Game", gameSchema);
    this.codes = connection.model<CodeRecord>("Code", codeSchema);
    this.redemptions = connection.model<RedemptionDoc>("Redemption", redemptionSchema);
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

  async mintCode(input: {
    chips: number;
    maxRedemptions: number | null;
    expiresAt: number | null;
    note: string;
    createdBy: string;
  }): Promise<CodeRecord> {
    const text = mintCodeText((bytes) => randomBytes(bytes));
    const record = {
      code: normaliseCode(text),
      chips: input.chips,
      maxRedemptions: input.maxRedemptions,
      redemptions: 0,
      expiresAt: input.expiresAt,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: Date.now(),
      revoked: false,
    };
    await this.codes.create(record);
    // Returned with its dashes, because that is the form a person is given.
    return { ...record, code: text };
  }

  async listCodes(limit: number): Promise<CodeRecord[]> {
    const docs = await this.codes.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs as unknown as CodeRecord[];
  }

  async revokeCode(code: string): Promise<boolean> {
    const result = await this.codes.updateOne(
      { code: normaliseCode(code) },
      { $set: { revoked: true } },
    );
    return result.matchedCount === 1;
  }

  /**
   * Pays a code out, once per player.
   *
   * Three steps, in this order for a reason. The claim comes first, because
   * the unique index is what makes "once each" true and a claim that loses
   * that race must cost nothing. The slot on the code comes second, so a code
   * that has run out is refused before any chips move. The chips come last,
   * and only once both have held.
   *
   * A crash between the second step and the third loses that redemption for
   * that player. For play chips that is an acceptable failure and a cheaper
   * one than a transaction, which would need a replica set to run at all.
   */
  async redeem(code: string, userId: string): Promise<RedeemResult> {
    const key = normaliseCode(code);
    const record = await this.codes.findOne({ code: key }).lean();
    if (record === null) {
      return { ok: false, reason: "unknown-code" };
    }

    const refusal = judgeCode(record as unknown as CodeRecord, Date.now());
    if (refusal !== null) {
      return { ok: false, reason: refusal };
    }

    try {
      await this.redemptions.create({ code: key, userId, chips: record.chips, at: Date.now() });
    } catch {
      // The only way this fails is the unique index, which is the answer.
      return { ok: false, reason: "already-redeemed" };
    }

    const taken = await this.codes.updateOne(
      {
        code: key,
        revoked: false,
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: Date.now() } }] },
          {
            $or: [
              { maxRedemptions: null },
              { $expr: { $lt: ["$redemptions", "$maxRedemptions"] } },
            ],
          },
        ],
      },
      { $inc: { redemptions: 1 } },
    );
    if (taken.modifiedCount !== 1) {
      // Somebody else took the last one between the check and here. Give the
      // claim back, so they can use a different code.
      await this.redemptions.deleteOne({ code: key, userId });
      return { ok: false, reason: "used-up" };
    }

    await this.adjustChips(userId, record.chips);
    const after = await this.get(userId);
    return { ok: true, chips: record.chips, balance: after?.chips ?? record.chips };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}
