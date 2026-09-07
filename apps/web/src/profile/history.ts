/** One finished record, as the server keeps it. */
export interface PlayedGame {
  code: string;
  rulesetName: string;
  buyIn: number;
  pot: number;
  players: Array<{
    userId: string | null;
    name: string;
    score: number;
    isBot: boolean;
    net?: number;
  }>;
  winnerIds: string[];
  endedAt: number;
}

/** A run of records at one table, shown as a single line. */
export interface Session {
  code: string;
  rulesetName: string;
  /** How many records went into this line. One means an ordinary game. */
  rounds: number;
  /** The most it ever seated, since people come and go across a session. */
  players: number;
  /** What your chips did across the whole run. */
  net: number;
  /** The end of the most recent record in the run. */
  endedAt: number;
  /** True when any record in the run predates chips being recorded per player. */
  estimated: boolean;
}

/**
 * What one record was worth to one player.
 *
 * Prefers the figure the game recorded. The fallback is for records written
 * before games recorded one, and it is only right for Greed: it assumes a
 * single pot won outright, which is exactly what blackjack is not — a hand
 * there has no pot, so an old blackjack row reads as zero either way.
 */
function worth(game: PlayedGame, userId: string): { net: number; recorded: boolean } {
  const mine = game.players.find((player) => player.userId === userId);
  if (mine?.net !== undefined) {
    return { net: mine.net, recorded: true };
  }
  const won = game.winnerIds.includes(userId);
  return { net: won ? game.pot - game.buyIn : -game.buyIn, recorded: false };
}

/**
 * Collapses a run of records at the same table into one line.
 *
 * A blackjack hand is a record but it is not a game — a night at one table
 * writes one row per hand, and five identical lines saying the same table and
 * the same nothing is not a history, it is a log. Greed groups by the same
 * rule and gets the same benefit: playing again keeps the table's code, so a
 * session there collapses too, and the count says how many games it was.
 *
 * Only consecutive records group. Leaving a table and coming back to it later
 * is two visits, and the games played in between are what separate them.
 */
export function bundle(history: readonly PlayedGame[], userId: string): Session[] {
  const sessions: Session[] = [];

  for (const game of history) {
    const { net, recorded } = worth(game, userId);
    const open = sessions.at(-1);

    if (open !== undefined && open.code === game.code && open.rulesetName === game.rulesetName) {
      open.rounds += 1;
      open.net += net;
      open.players = Math.max(open.players, game.players.length);
      open.endedAt = Math.max(open.endedAt, game.endedAt);
      open.estimated = open.estimated || !recorded;
      continue;
    }

    sessions.push({
      code: game.code,
      rulesetName: game.rulesetName,
      rounds: 1,
      players: game.players.length,
      net,
      endedAt: game.endedAt,
      estimated: !recorded,
    });
  }

  return sessions;
}

/**
 * A change in chips, written the way a person reads one.
 *
 * Negative zero is the reason this exists rather than a template string. It is
 * a real number in JavaScript, it is `>= 0`, and it formats as "-0" — so the
 * obvious sign test printed a plus in front of a minus and the history read
 * "+-0" on every hand that broke even.
 */
export function signed(net: number): string {
  if (net === 0) {
    return "0";
  }
  const shown = net.toLocaleString("en-US");
  return net > 0 ? `+${shown}` : shown;
}
