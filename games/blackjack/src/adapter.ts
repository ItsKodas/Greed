import { TableError } from "@greed/core";
import type { GameAdapter } from "@greed/core";
import { BLACKJACK } from "./listing.js";
import { Table } from "./table.js";

/**
 * What the room does with a blackjack table.
 *
 * The interesting difference from Greed is when money moves. Greed takes every
 * stake once at the deal and pays a pot at the end; blackjack takes each stake
 * as it is placed, takes more again on a double, and settles every hand
 * separately. That is why taking chips belongs to the game rather than to the
 * server — the server would have had to know which of those two it was.
 */
export function blackjackAdapter(options: { random?: () => number } = {}): GameAdapter<Table> {
  const random = options.random ?? Math.random;

  return {
    listing: BLACKJACK,

    create(code) {
      return new Table(code, random);
    },

    async act(table, seatId, action, deps) {
      const move = action as { type?: string; amount?: number };
      const seat = table.seats.find((candidate) => candidate.id === seatId);
      if (seat === undefined) {
        throw new TableError("You are not at this table.");
      }

      switch (move.type) {
        case "bet": {
          const amount = Number(move.amount);
          const already = seat.bet;
          // Validated by the table first, so a refusal costs nobody anything.
          table.bet(seatId, amount);
          if (seat.userId === null) {
            throw new TableError("Sign in to play for chips.");
          }
          // Only the difference, so changing a bet before the deal does not
          // charge twice for the same hand.
          const owed = amount - already;
          if (owed > 0 && !(await deps.take(seat.userId, owed))) {
            table.bet(seatId, already === 0 ? amount : already);
            seat.bet = already;
            throw new TableError("You cannot cover that bet.");
          }
          if (owed < 0) {
            await deps.give(seat.userId, -owed);
          }
          return;
        }
        case "deal":
          table.deal(seatId);
          return;
        case "hit":
          table.hit(seatId);
          return;
        case "stand":
          table.stand(seatId);
          return;
        case "double": {
          if (seat.userId === null) {
            throw new TableError("Sign in to play for chips.");
          }
          // Asked for before it happens: doubling into chips you do not have
          // would leave a hand staked at more than was ever taken.
          const extra = seat.bet;
          if (!(await deps.take(seat.userId, extra))) {
            throw new TableError("You cannot cover a double.");
          }
          try {
            table.double(seatId);
          } catch (error) {
            await deps.give(seat.userId, extra);
            throw error;
          }
          return;
        }
        case "nextHand":
          table.nextHand(seatId);
          return;
        default:
          throw new TableError("That is not something you can do here.");
      }
    },

    isSettled(table) {
      return table.phase === "settled";
    },

    /**
     * Hands back what each seat is owed.
     *
     * The stakes are already gone — taken as they were placed — so this only
     * ever gives. A loss is simply nothing coming back.
     */
    async settle(table, deps) {
      const played = table.seats.filter((seat) => !seat.waiting && seat.bet > 0);

      for (const seat of played) {
        if (seat.userId === null) {
          continue;
        }
        if (seat.returned > 0) {
          await deps.give(seat.userId, seat.returned);
        }
        const won = seat.outcome === "won" || seat.outcome === "blackjack";
        await deps.record(seat.userId, {
          shared: {
            games: 1,
            wins: won ? 1 : 0,
            chipsWon: seat.returned - seat.bet,
          },
          game: BLACKJACK.id,
          add: {
            blackjacks: seat.outcome === "blackjack" ? 1 : 0,
            busts: seat.outcome === "bust" ? 1 : 0,
            pushes: seat.outcome === "push" ? 1 : 0,
          },
          max: { biggestWin: Math.max(0, seat.returned - seat.bet) },
        });
      }

      await deps.finished({
        code: table.code,
        rulesetName: "Blackjack",
        // A hand has no single stake and no pot to divide; the totals are what
        // the history can honestly say about it.
        buyIn: 0,
        pot: played.reduce((total, seat) => total + seat.bet, 0),
        players: played.map((seat) => ({
          userId: seat.userId,
          name: seat.name,
          // No score in blackjack, so the hand's own total stands in.
          score: seat.total ?? 0,
          isBot: seat.isBot,
        })),
        winnerIds: played
          .filter((seat) => seat.outcome === "won" || seat.outcome === "blackjack")
          .map((seat) => seat.userId ?? seat.id),
        endedAt: Date.now(),
      });
    },
  };
}
