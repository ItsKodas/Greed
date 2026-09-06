import { randomBytes } from "node:crypto";
import { judgeCode, mintCodeText, normaliseCode } from "./codes.js";
import type { CodeRecord, RedeemResult } from "./codes.js";
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
  players: Array<{ userId: string | null; name: string; score: number; isBot: boolean }>;
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

  async close(): Promise<void> {
    // nothing to release
  }
}
