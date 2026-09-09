import { randomBytes, randomUUID } from "node:crypto";
import { judgeCode, mintCodeText, normaliseCode } from "./codes.js";
import type { CodeRecord, RedeemResult } from "./codes.js";
import { judgeEmote } from "./emotes.js";
import { judgeSend, leftToSend, SEND_WINDOW_MS } from "./transfers.js";
import type { SendResult, Transfer } from "./transfers.js";
import type { EmoteAsset, EmoteRecord, NewEmote } from "./emotes.js";
/**
 * Where profiles, chips and finished games live.
 *
 * Behind an interface with two implementations, because the game has to work
 * with no database at all — that is how it has run all along, and losing that
 * would mean you could not try it without standing a Mongo up first. The
 * memory store is both the no-database mode and the test double.
 */

export interface Profile {
  id: string;
  discordId: string;
  name: string;
  avatar: string | null;
  accentColor: number | null;
  chips: number;
  lastDailyClaim: number | null;
  stats: ProfileStats;
  /**
   * Per-game figures, under the id of the game that keeps them.
   *
   * Deliberately untyped beyond "numbers by name". `bestTurn`, `farkles` and
   * `hotDice` used to sit in the shared profile, where they were three of the
   * six things a player was — and blackjack has no answer for any of them. A
   * game names its own figures; nothing here knows what they mean.
   */
  byGame: Record<string, Record<string, number>>;
}

/**
 * A player as somebody else may see them.
 *
 * What is not here is the point of it: no balance, no Discord id, no stats.
 * Enough to recognise a person you meant to pay and no more.
 */
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string | null;
  accentColor: number | null;
}

/** What every game can answer about a player, whatever the game is. */
export interface ProfileStats {
  games: number;
  wins: number;
  chipsWon: number;
}

/**
 * One update to a player's figures.
 *
 * The caller says which of its own figures are running totals and which are
 * high-water marks, because only the game knows: a best turn is a maximum, a
 * count of farkles is a sum, and the store cannot tell them apart by name
 * without knowing the game — which is exactly what it must not know.
 */
export interface StatBump {
  /** Totals every game shares. */
  shared?: Partial<ProfileStats>;
  /** The game these figures belong to. Required if either map is given. */
  game?: string;
  /** Added to whatever is there. */
  add?: Record<string, number>;
  /** Kept only if larger than what is there. */
  max?: Record<string, number>;
}

export interface GameRecord {
  code: string;
  rulesetName: string;
  buyIn: number;
  pot: number;
  players: Array<{
    userId: string | null;
    name: string;
    score: number;
    isBot: boolean;
    /**
     * What this player's chips did. Optional because records written before
     * it existed do not have one, and a history that hid those would be worse
     * than one that shows them with the figure it can still work out.
     */
    net?: number;
  }>;
  winnerIds: string[];
  endedAt: number;
}

export interface DailyResult {
  ok: boolean;
  /** Why not, when ok is false. */
  reason?: "not-needed" | "too-soon" | "unknown-player";
  granted: number;
  chips: number;
  /** When they may next claim, in epoch ms. */
  nextAt?: number;
}

/**
 * The banks this building keeps, by the game that fills them.
 *
 * A closed set rather than a string, so a typo is a build error rather than a
 * bank nobody can find that quietly holds somebody's chips.
 */
/**
 * The banks in the building, one per game that pays from one.
 *
 * Separate on purpose. A shared bank would be whichever game holds back the
 * most quietly paying for the one that holds back the least — the machine
 * keeps a tenth of what goes through it, a blackjack table about a
 * two-hundredth and a single-zero wheel about a thirty-seventh, so one pot
 * would be the machine funding the felt.
 */
export type BankName = "slots" | "blackjack" | "roulette";

export interface Store {
  readonly kind: "memory" | "mongo";
  upsertDiscordUser(input: {
    discordId: string;
    name: string;
    avatar: string | null;
    accentColor: number | null;
  }): Promise<Profile>;
  get(id: string): Promise<Profile | null>;
  /**
   * Moves a balance. Returns false rather than overdrawing, so a debit is safe
   * to call concurrently — the Mongo implementation does it as one conditional
   * update rather than a read followed by a write.
   */
  adjustChips(id: string, delta: number): Promise<boolean>;
  claimDaily(id: string): Promise<DailyResult>;
  bumpStats(id: string, bump: StatBump): Promise<void>;
  recordGame(record: GameRecord): Promise<void>;

  /**
   * A game's bank: chips players have staked at it and not yet won back.
   *
   * It lives here rather than at the game because it is real money and has to
   * survive a restart. Nothing in the building may add to one except play at
   * that game and an admin's deliberate float — a bank that could be topped up
   * from anywhere is a house that mints chips, which is the one thing this
   * casino must not contain.
   *
   * One per game rather than one for the building, and the name is required
   * rather than defaulted. The two games fill their banks at very different
   * rates — a machine keeps a tenth of what goes through it, a blackjack table
   * about a two-hundredth — so a shared bank would be the machine quietly
   * paying for the table. A missing argument would be exactly that bug,
   * silently, so there is no argument to miss.
   */
  bank(which: BankName): Promise<number>;
  bankAdd(which: BankName, delta: number): Promise<void>;
  /** Pays out, or returns false rather than overdrawing. */
  bankTake(which: BankName, amount: number): Promise<boolean>;

  /** Puts a new code into circulation. */
  mintCode(input: {
    chips: number;
    maxRedemptions: number | null;
    expiresAt: number | null;
    note: string;
    createdBy: string;
  }): Promise<CodeRecord>;
  /** Newest first, for the person who has to decide what to revoke. */
  listCodes(limit: number): Promise<CodeRecord[]>;
  /** Stops a code without deleting it, so the ledger still explains itself. */
  revokeCode(code: string): Promise<boolean>;
  /**
   * Pays a code out, once per player.
   *
   * Every implementation must make "once each" a thing that cannot be raced:
   * two clicks a millisecond apart are the ordinary case, not the exotic one.
   */
  redeem(code: string, userId: string): Promise<RedeemResult>;
  recentGames(userId: string, limit: number): Promise<GameRecord[]>;

  /**
   * Players whose name begins with this, for somebody looking for one to pay.
   *
   * A prefix rather than anything cleverer, and capped, because this is the
   * one route in the building that answers questions about people who are not
   * asking. It is behind a sign-in, it never returns a balance, and a caller
   * gets a handful of matches rather than the playerbase.
   */
  findPlayers(prefix: string, limit: number): Promise<PublicPlayer[]>;

  /**
   * Moves chips from one account to another, and writes it down.
   *
   * One method rather than two `adjustChips` calls, because a debit that
   * lands and a credit that does not is chips destroyed, and neither caller
   * nor store would know. Everything the rule depends on — what the sender
   * holds, what they have already sent today — is read here rather than passed
   * in, so no caller can decide it is allowed.
   */
  send(fromId: string, toId: string, amount: number): Promise<SendResult>;

  /** What this account has sent inside the window ending now. */
  sentSince(userId: string, since: number): Promise<number>;

  /** This account's transfers, in and out, newest first. */
  transfers(userId: string, limit: number): Promise<Transfer[]>;

  /**
   * The emotes players may throw at each other, and the files behind them.
   *
   * Uploaded by an admin, which puts them behind the same allowlist as minting
   * a code — not because an emote is chips, but because it is the one thing in
   * this building that a person supplies and every other person's browser then
   * loads. What may be uploaded is decided in `emotes.ts`, off the bytes.
   *
   * Note that a store which keeps nothing keeps no emotes either, so a room
   * with no database has none to offer. That is the same bargain profiles,
   * chips and codes already make, and the alternative — a picture that lives
   * until the next restart — is worse than not offering one.
   */
  addEmote(input: NewEmote): Promise<EmoteRecord>;
  /** Newest first. `all` includes retired ones, for the admin's list. */
  listEmotes(all: boolean): Promise<EmoteRecord[]>;
  /**
   * One emote's picture or sound, or null when there is none.
   *
   * Answers for a retired emote too: it may still be waiting in a bonus pool
   * to be replayed at whoever threw it, and a replay that renders as a broken
   * image is worse than one that should not have been offered.
   */
  emoteAsset(id: string, which: "image" | "sound"): Promise<EmoteAsset | null>;
  /** Stops an emote being offered, without deleting what it was. */
  retireEmote(id: string): Promise<boolean>;

  close(): Promise<void>;
}

/** What a new profile starts with. */
export const STARTING_CHIPS = 10_000;
/** Below this, a player may claim the top-up. */
export const DAILY_FLOOR = 2_000;
export const DAILY_GRANT = 5_000;
export const DAILY_INTERVAL_MS = 20 * 60 * 60 * 1000;

export function emptyStats(): ProfileStats {
  return { games: 0, wins: 0, chipsWon: 0 };
}

/**
 * Decides a daily claim. Shared by both stores so the rule cannot drift
 * between "running with a database" and "running without one".
 */
export function judgeDaily(profile: Profile, now: number): DailyResult {
  if (profile.chips >= DAILY_FLOOR) {
    return { ok: false, reason: "not-needed", granted: 0, chips: profile.chips };
  }
  const last = profile.lastDailyClaim;
  if (last !== null && now - last < DAILY_INTERVAL_MS) {
    return {
      ok: false,
      reason: "too-soon",
      granted: 0,
      chips: profile.chips,
      nextAt: last + DAILY_INTERVAL_MS,
    };
  }
  return { ok: true, granted: DAILY_GRANT, chips: profile.chips + DAILY_GRANT };
}

export class MemoryStore implements Store {
  private readonly codes = new Map<string, CodeRecord>();
  /** "code:player", which is the whole of the one-each rule in memory. */
  private readonly redeemed = new Set<string>();
  readonly kind = "memory" as const;
  private readonly people = new Map<string, Profile>();
  private readonly games: GameRecord[] = [];
  /** Each game's bank. Numbers, because that is all they ever are. */
  private readonly house = new Map<BankName, number>();
  private readonly emotes = new Map<string, EmoteRecord>();
  /**
   * The files, apart from the records that describe them.
   *
   * Two maps rather than one, for the same reason the record carries no bytes:
   * listing the emotes is a common thing to do and copying a couple of
   * megabytes each time to answer it is not.
   */
  /** Every transfer ever made here, oldest first. Appended to, never edited. */
  private readonly ledger: Transfer[] = [];
  private readonly emoteFiles = new Map<
    string,
    { image: EmoteAsset; sound: EmoteAsset | null }
  >();

  async bank(which: BankName): Promise<number> {
    return this.house.get(which) ?? 0;
  }

  async bankAdd(which: BankName, delta: number): Promise<void> {
    this.house.set(which, (this.house.get(which) ?? 0) + delta);
  }

  async bankTake(which: BankName, amount: number): Promise<boolean> {
    const held = this.house.get(which) ?? 0;
    if (amount > held) {
      return false;
    }
    this.house.set(which, held - amount);
    return true;
  }

  async upsertDiscordUser(input: {
    discordId: string;
    name: string;
    avatar: string | null;
    accentColor: number | null;
  }): Promise<Profile> {
    const existing = [...this.people.values()].find(
      (person) => person.discordId === input.discordId,
    );
    if (existing !== undefined) {
      existing.name = input.name;
      existing.avatar = input.avatar;
      existing.accentColor = input.accentColor;
      return existing;
    }
    const profile: Profile = {
      id: `u_${input.discordId}`,
      discordId: input.discordId,
      name: input.name,
      avatar: input.avatar,
      accentColor: input.accentColor,
      chips: STARTING_CHIPS,
      lastDailyClaim: null,
      stats: emptyStats(),
      byGame: {},
    };
    this.people.set(profile.id, profile);
    return profile;
  }

  async get(id: string): Promise<Profile | null> {
    return this.people.get(id) ?? null;
  }

  async adjustChips(id: string, delta: number): Promise<boolean> {
    const profile = this.people.get(id);
    if (profile === undefined) {
      return false;
    }
    if (delta < 0 && profile.chips + delta < 0) {
      return false;
    }
    profile.chips += delta;
    return true;
  }

  async claimDaily(id: string): Promise<DailyResult> {
    const profile = this.people.get(id);
    if (profile === undefined) {
      return { ok: false, reason: "unknown-player", granted: 0, chips: 0 };
    }
    const verdict = judgeDaily(profile, Date.now());
    if (verdict.ok) {
      profile.chips += verdict.granted;
      profile.lastDailyClaim = Date.now();
    }
    return verdict;
  }

  async bumpStats(id: string, bump: StatBump): Promise<void> {
    const profile = this.people.get(id);
    if (profile === undefined) {
      return;
    }
    for (const [key, value] of Object.entries(bump.shared ?? {})) {
      profile.stats[key as keyof ProfileStats] += value;
    }
    if (bump.game === undefined) {
      return;
    }
    profile.byGame[bump.game] ??= {};
    const figures = profile.byGame[bump.game];
    for (const [key, value] of Object.entries(bump.add ?? {})) {
      figures[key] = (figures[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(bump.max ?? {})) {
      figures[key] = Math.max(figures[key] ?? 0, value);
    }
  }

  async recordGame(record: GameRecord): Promise<void> {
    this.games.unshift(record);
    this.games.splice(200);
  }

  async recentGames(userId: string, limit: number): Promise<GameRecord[]> {
    return this.games
      .filter((game) => game.players.some((player) => player.userId === userId))
      .slice(0, limit);
  }

  async mintCode(input: {
    chips: number;
    maxRedemptions: number | null;
    expiresAt: number | null;
    note: string;
    createdBy: string;
  }): Promise<CodeRecord> {
    const record: CodeRecord = {
      code: mintCodeText((bytes) => randomBytes(bytes)),
      chips: input.chips,
      maxRedemptions: input.maxRedemptions,
      redemptions: 0,
      expiresAt: input.expiresAt,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: Date.now(),
      revoked: false,
    };
    this.codes.set(normaliseCode(record.code), record);
    return record;
  }

  async listCodes(limit: number): Promise<CodeRecord[]> {
    return [...this.codes.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async revokeCode(code: string): Promise<boolean> {
    const record = this.codes.get(normaliseCode(code));
    if (record === undefined) {
      return false;
    }
    record.revoked = true;
    return true;
  }

  async redeem(code: string, userId: string): Promise<RedeemResult> {
    const key = normaliseCode(code);
    const record = this.codes.get(key);
    if (record === undefined) {
      return { ok: false, reason: "unknown-code" };
    }
    if (this.redeemed.has(`${key}:${userId}`)) {
      return { ok: false, reason: "already-redeemed" };
    }
    const refusal = judgeCode(record, Date.now());
    if (refusal !== null) {
      return { ok: false, reason: refusal };
    }
    const profile = this.people.get(userId);
    if (profile === undefined) {
      return { ok: false, reason: "unknown-code" };
    }
    this.redeemed.add(`${key}:${userId}`);
    record.redemptions += 1;
    profile.chips += record.chips;
    return { ok: true, chips: record.chips, balance: profile.chips };
  }

  async findPlayers(prefix: string, limit: number): Promise<PublicPlayer[]> {
    const wanted = prefix.trim().toLowerCase();
    if (wanted.length === 0) {
      return [];
    }
    return [...this.people.values()]
      .filter((person) => person.name.toLowerCase().startsWith(wanted))
      .slice(0, limit)
      .map((person) => ({
        id: person.id,
        name: person.name,
        avatar: person.avatar,
        accentColor: person.accentColor,
      }));
  }

  async sentSince(userId: string, since: number): Promise<number> {
    return this.ledger
      .filter((one) => one.fromId === userId && one.at >= since)
      .reduce((total, one) => total + one.amount, 0);
  }

  async transfers(userId: string, limit: number): Promise<Transfer[]> {
    return this.ledger
      .filter((one) => one.fromId === userId || one.toId === userId)
      .sort((left, right) => right.at - left.at)
      .slice(0, limit);
  }

  async send(fromId: string, toId: string, amount: number): Promise<SendResult> {
    const from = this.people.get(fromId);
    const to = this.people.get(toId);
    const sentToday = await this.sentSince(fromId, Date.now() - SEND_WINDOW_MS);
    const left = leftToSend(sentToday);
    if (from === undefined) {
      return { ok: false, reason: "no-recipient", leftToday: left };
    }
    if (to === undefined) {
      return { ok: false, reason: "no-recipient", leftToday: left };
    }
    if (fromId === toId) {
      return { ok: false, reason: "to-yourself", leftToday: left };
    }
    const judged = judgeSend({ amount, balance: from.chips, sentToday });
    if (!judged.ok) {
      return { ok: false, reason: judged.reason, leftToday: left };
    }

    from.chips -= amount;
    to.chips += amount;
    this.ledger.push({
      id: randomUUID(),
      fromId,
      fromName: from.name,
      toId,
      toName: to.name,
      amount,
      at: Date.now(),
    });
    return {
      ok: true,
      balance: from.chips,
      amount,
      leftToday: left - amount,
      to: { id: to.id, name: to.name },
    };
  }

  async addEmote(input: NewEmote): Promise<EmoteRecord> {
    /*
     * Judged here as well as at the route, and not as a belt-and-braces
     * gesture: this is the last point before bytes become something every
     * player's browser will load, and a caller that forgot to check is the
     * exact way an unchecked file gets in. Throwing is right — a store handed
     * a file it must not keep has been asked to do something impossible.
     */
    const judged = judgeEmote(input);
    if (!judged.ok) {
      throw new Error(judged.reason);
    }
    const record: EmoteRecord = {
      id: randomUUID(),
      name: judged.emote.name,
      cost: judged.emote.cost,
      imageMime: judged.emote.imageMime,
      soundMime: judged.emote.soundMime,
      imageBytes: input.image.length,
      soundBytes: judged.emote.soundMime === null ? null : (input.sound?.length ?? null),
      createdBy: input.createdBy,
      createdAt: Date.now(),
      retired: false,
    };
    this.emotes.set(record.id, record);
    /*
     * Copied rather than kept by reference. The caller owns the buffer it
     * decoded and is free to reuse it; a store that held on to it would serve
     * whatever that buffer happened to contain later.
     */
    this.emoteFiles.set(record.id, {
      image: { mime: judged.emote.imageMime, bytes: Uint8Array.from(input.image) },
      sound:
        judged.emote.soundMime === null || input.sound === null
          ? null
          : { mime: judged.emote.soundMime, bytes: Uint8Array.from(input.sound) },
    });
    return record;
  }

  async listEmotes(all: boolean): Promise<EmoteRecord[]> {
    return [...this.emotes.values()]
      .filter((emote) => all || !emote.retired)
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async emoteAsset(id: string, which: "image" | "sound"): Promise<EmoteAsset | null> {
    const files = this.emoteFiles.get(id);
    if (files === undefined) {
      return null;
    }
    return which === "image" ? files.image : files.sound;
  }

  async retireEmote(id: string): Promise<boolean> {
    const emote = this.emotes.get(id);
    if (emote === undefined || emote.retired) {
      return false;
    }
    emote.retired = true;
    return true;
  }

  async close(): Promise<void> {
    // nothing to release
  }
}
