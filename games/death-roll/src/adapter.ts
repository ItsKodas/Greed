import type { BotMove, GameAdapter, GameDeps } from "@backroom/core";
import { seatLimit, TableError } from "@backroom/core";
import { decide, thinkingTime } from "./bot.js";
import {
  anteFor,
  DEAL_MS,
  DEATH_ROLL,
  openingFor,
  RESULT_MS,
  SHORT_RETRY_MS,
  TURN_MS,
} from "./listing.js";
import { Table } from "./table.js";

/**
 * What the room does with a death roll table.
 *
 * The money is the simplest in the building and needs no bank to be honest:
 * every chip in the pot came off one of the two people playing for it, and one
 * of them takes it. The room hands out nothing it was not handed first, by the
 * shape of the game rather than by a cap argued from a worst case.
 *
 * The timing is the awkward part, and it is unlike every other game here.
 * Elsewhere a hand is over the instant the last card lands and settling only
 * catches the chips up; here the money moving *is* the state changing, because
 * a duel cannot start until both antes are in and nothing starts one but a
 * clock. `pause` is synchronous and cannot take an ante, so the table asks for
 * a duel and `payOut` — asynchronous, unlatched, run on every broadcast —
 * answers, then asks the room to send the state again.
 */

export function deathRollAdapter(
  options: {
    /**
     * Where the number comes from.
     *
     * Injected so tests can roll to order, and in the server it is
     * `randomInt` rather than `Math.random`: this game hands the player its
     * whole result every single turn, which is exactly the run of observations
     * that recovers xorshift128+ state — and somebody who knew the next roll
     * would know whether to spend their pass, which is the entire game.
     */
    roll?: (ceiling: number) => number;
    turnMs?: number;
    resultMs?: number;
    dealMs?: number;
    shortRetryMs?: number;
  } = {},
): GameAdapter<Table> {
  const roll = options.roll ?? ((ceiling: number) => Math.floor(Math.random() * ceiling) + 1);
  const turnMs = options.turnMs ?? TURN_MS;
  const resultMs = options.resultMs ?? RESULT_MS;
  const dealMs = options.dealMs ?? DEAL_MS;
  const shortRetryMs = options.shortRetryMs ?? SHORT_RETRY_MS;

  /**
   * Chips off a player, wherever this table's chips live.
   *
   * Two entirely separate worlds behind one verb, and keeping them apart is
   * the point: a for-fun table's purses are on the table and are gone when it
   * closes, and a chips table's are real balances belonging to real people. A
   * branch that got this wrong would quietly spend the latter.
   */
  const take = async (
    table: Table,
    seat: { id: string; userId: string | null },
    chips: number,
    deps: GameDeps,
  ): Promise<boolean> => {
    if (table.forFun) {
      if (table.purseFor(seat.id) < chips) {
        return false;
      }
      table.movePurse(seat.id, -chips);
      return true;
    }
    if (seat.userId === null) {
      throw new TableError("Sign in to play for chips.");
    }
    return await deps.take(seat.userId, chips);
  };

  /** Chips back to a player, from the same two worlds. */
  const give = async (
    table: Table,
    seat: { id: string; userId: string | null },
    chips: number,
    deps: GameDeps,
  ): Promise<void> => {
    if (chips <= 0) {
      return;
    }
    if (table.forFun) {
      table.movePurse(seat.id, chips);
      return;
    }
    if (seat.userId !== null) {
      await deps.give(seat.userId, chips);
    }
  };

  return {
    listing: DEATH_ROLL,

    create(code, made) {
      const table = new Table(code, seatLimit(made?.["maxSeats"], DEATH_ROLL.maxSeats), {
        opening: openingFor(made?.["ceiling"]),
        ante: anteFor(made?.["buyIn"]),
        turnMs,
      });
      // Fixed when the table is opened: a table anybody may sit at and one
      // that spends real chips are not the same game with a different label.
      table.forFun = made?.["forFun"] === true;
      return table;
    },

    async act(table, seatId, action, deps) {
      const move = action as { type?: string };
      const seat = table.seats.find((one) => one.id === seatId);
      if (seat === undefined) {
        throw new TableError("You are not at this table.");
      }
      const duel = table.duel;
      if (duel === null) {
        throw new TableError("There is no duel to play here yet.");
      }

      switch (move.type) {
        case "roll": {
          duel.roll(seatId, roll);
          table.touchClock();
          return;
        }
        case "pass": {
          /*
           * Asked, paid, then spent. The table is asked first because it is
           * the cheap refusal, and the pass is only marked spent once the
           * chips are actually gone — so a player who cannot afford it is
           * refused with their pass still in hand rather than burnt.
           */
          const price = duel.checkPass(seatId);
          if (!(await take(table, seat, price, deps))) {
            throw new TableError(
              table.forFun ? "That is more than your purse." : "You cannot cover a pass.",
            );
          }
          duel.pass(seatId);
          table.touchClock();
          return;
        }
        default:
          throw new TableError("That is not a move at this table.");
      }
    },

    /**
     * The antes, and the one thing in the building that starts a game here.
     *
     * Drained before the first await, which is what makes running on every
     * broadcast into exactly-once rather than a way to charge somebody twice.
     * Returns true only on the call that actually dealt, so the extra
     * broadcast this asks for cannot recur.
     */
    async payOut(table, deps) {
      const wanted = table.takePending();
      if (wanted === null) {
        return false;
      }
      const [first, second] = wanted;
      if (first === undefined || second === undefined) {
        return false;
      }
      const seats = [first, second].map((id) => table.seats.find((one) => one.id === id));
      const [one, two] = seats;
      if (one === undefined || two === undefined) {
        return false;
      }

      /*
       * Play money is topped back up rather than allowed to stop the table.
       * Nothing is at stake, so running dry should cost somebody a moment
       * rather than their evening.
       */
      table.topUp(one.id);
      table.topUp(two.id);

      if (!(await take(table, one, table.ante, deps))) {
        /*
         * Only worth sending if it is news. The table retries on a timer, and
         * a player who is still short is not a new fact — telling everybody
         * again on every retry would be a table talking to itself.
         */
        return table.noteShort(one.id);
      }
      if (!(await take(table, two, table.ante, deps))) {
        /*
         * Straight back, before anything else happens. A duel that took one
         * ante and failed the second would be a table holding somebody's stake
         * for a game that never happened.
         */
        await give(table, one, table.ante, deps);
        return table.noteShort(two.id);
      }
      table.begin();
      return true;
    },

    isSettled(table) {
      return table.phase === "over";
    },

    /**
     * Pays what the duel came to.
     *
     * The pot and nothing else, out of chips that are already in it. There is
     * no bank to draw on and none is wanted: every chip here came off one of
     * these two people.
     */
    async settle(table, deps) {
      const duel = table.duel;
      if (duel === null || duel.loserId === null) {
        return;
      }
      const winnerId = duel.winnerId;
      const winner = table.seats.find((one) => one.id === winnerId);
      if (winner !== undefined) {
        await give(table, winner, duel.pot, deps);
      }

      /*
       * Play money is paid but never recorded. A for-fun table touches no
       * account, so a win there is not a win anybody's profile should claim —
       * and a guest has no account to write one on either way.
       */
      if (table.forFun) {
        return;
      }

      for (const seat of table.seats) {
        if (seat.userId === null) {
          continue;
        }
        const net = duel.netFor(seat.id);
        await deps.record(seat.userId, {
          shared: { games: 1, wins: net > 0 ? 1 : 0, chipsWon: net },
          game: DEATH_ROLL.id,
          add: { duels: 1, passes: duel.hasPassed(seat.id) ? 1 : 0 },
          max: { pot: duel.pot },
        });
      }

      await deps.finished({
        code: table.code,
        /* What it was played at, which is the only ruleset this game has. */
        rulesetName: `${table.opening}`,
        buyIn: table.ante,
        pot: duel.pot,
        players: table.seats.map((seat) => ({
          userId: seat.userId,
          name: seat.name,
          /* The last number they rolled, which is what a duel leaves behind. */
          score: duel.history.filter((one) => one.seatId === seat.id).at(-1)?.result ?? 0,
          isBot: seat.isBot,
          net: duel.netFor(seat.id),
        })),
        winnerIds: winnerId === null ? [] : [winnerId],
        endedAt: Date.now(),
      });
    },

    winners(table) {
      const winner = table.duel?.winnerId ?? null;
      return winner === null ? [] : [winner];
    },

    clock(table) {
      const duel = table.duel;
      const endsAt = table.turnEndsAt;
      if (duel === null || duel.over || endsAt === null) {
        return null;
      }
      // The table's own deadline, which is also the one it puts in the view —
      // so what runs out on screen is what runs out here.
      return { seatId: duel.toRoll, endsAt };
    },

    /**
     * Rolls for somebody whose time ran out, rather than forfeiting for them.
     *
     * Rolling is chance either way, so a clock cannot disadvantage an absent
     * player: there is no decision being taken away from them, only a pass
     * they were not going to spend. Forfeiting would let a bad connection lose
     * somebody their stake, which is the one thing a clock must never do.
     */
    timeout(table, seatId) {
      const duel = table.duel;
      if (duel === null || duel.over || duel.toRoll !== seatId) {
        return;
      }
      duel.roll(seatId, roll);
      table.touchClock();
    },

    /**
     * A bot's turn, or nothing.
     *
     * Only ever at a table playing for nothing — the table refuses to seat one
     * anywhere else, so by the time there is a bot here the question of real
     * chips has already been settled.
     */
    botMove(table): BotMove | null {
      const duel = table.duel;
      if (duel === null || duel.over) {
        return null;
      }
      const seat = table.seats.find((one) => one.id === duel.toRoll);
      if (seat === undefined || !seat.isBot) {
        return null;
      }
      const choice = decide({
        skill: seat.skill ?? "normal",
        ceiling: duel.ceiling,
        ante: table.ante,
        price: table.passPrice,
        canPass: !duel.hasPassed(seat.id) && table.purseFor(seat.id) >= table.passPrice,
      });
      return {
        seatId: seat.id,
        delayMs: thinkingTime(seat.skill ?? "normal"),
        play() {
          /*
           * Checked again on the way in. A bot thinks for the best part of a
           * second and the table does not stop for it — the clock may have
           * rolled for somebody and moved the turn on, and a move sent for a
           * seat whose turn it no longer is would throw with nobody to hear.
           */
          if (table.duel !== duel || duel.over || duel.toRoll !== seat.id) {
            return;
          }
          if (choice === "pass") {
            table.movePurse(seat.id, -table.passPrice);
            duel.pass(seat.id);
          } else {
            duel.roll(seat.id, roll);
          }
          table.touchClock();
        },
      };
    },

    /**
     * The table's own clock, which is what makes it deal itself.
     *
     * Three waits. A result sits where it is long enough to be read and is
     * then cleared away; a table with two people at it and no duel on the
     * felt asks for one after a beat; and a table waiting on a short ante
     * asks again, but slower — it has to keep asking, since they may top up,
     * but asking every two seconds would be hammering the economy for chips
     * that are not coming. Nobody presses start.
     */
    pause(table) {
      if (table.phase === "over") {
        return { key: "result", ms: resultMs, run: () => table.finish() };
      }
      if (table.phase === "waiting" && table.ready && !table.pending) {
        if (table.shortId !== null) {
          return { key: "short", ms: shortRetryMs, run: () => table.askForDuel() };
        }
        return { key: "deal", ms: dealMs, run: () => table.askForDuel() };
      }
      return null;
    },
  };
}
