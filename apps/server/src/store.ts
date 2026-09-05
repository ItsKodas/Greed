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
}

export interface ProfileStats {
  games: number;
  wins: number;
  chipsWon: number;
  bestTurn: number;
  farkles: number;
  hotDice: number;
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
  bumpStats(id: string, changes: Partial<ProfileStats>): Promise<void>;
  recordGame(record: GameRecord): Promise<void>;
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
  return { games: 0, wins: 0, chipsWon: 0, bestTurn: 0, farkles: 0, hotDice: 0 };
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

  async bumpStats(id: string, changes: Partial<ProfileStats>): Promise<void> {
    const profile = this.people.get(id);
    if (profile === undefined) {
      return;
    }
    for (const [key, value] of Object.entries(changes) as Array<[keyof ProfileStats, number]>) {
      if (key === "bestTurn") {
        profile.stats.bestTurn = Math.max(profile.stats.bestTurn, value);
      } else {
        profile.stats[key] += value;
      }
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

  async close(): Promise<void> {
    // nothing to release
  }
}
