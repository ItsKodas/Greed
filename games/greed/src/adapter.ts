import { DEFAULT_RULESET, RULESETS } from "@greed/rules";
import type { BotMove, Clock, GameAdapter } from "@greed/core";
import { comboGateKeyFor } from "./gatekey.js";
import { decide, thinkingTime } from "./bot.js";
import { Room } from "./room.js";
import type { Roller } from "./room.js";
import { GREED } from "./listing.js";

/**
 * What the room does with a Greed table.
 *
 * All of this used to live in the socket layer, where it was the reason the
 * server could only ever host one game: the turn clock, the bot's thinking,
 * the pause after a farkle and the sharing out of a pot are Greed's rules, not
 * a server's. They are here now and the server asks rather than knows.
 */
/**
 * A factory rather than a value, because the dice have to come from somewhere.
 * A test hands in a scripted roller and gets a table whose every throw is
 * known; production hands in nothing and gets real ones.
 */
export function greedAdapter(options: { roll?: Roller } = {}): GameAdapter<Room> {
  const roll: Roller =
    options.roll ??
    ((count) =>
      Array.from({ length: count }, () => (1 + Math.floor(Math.random() * 6)) as 1 | 2 | 3 | 4 | 5 | 6));

  return {
  listing: GREED,

  create(code, made) {
    const wanted = typeof made?.["ruleset"] === "string" ? made["ruleset"] : undefined;
    const chosen = RULESETS.find((candidate) => candidate.name === wanted) ?? DEFAULT_RULESET;
    return new Room(code, roll, chosen);
  },

  /**
   * Greed's verbs.
   *
   * Money moves here rather than in the server because when it moves is part
   * of the rules: Greed takes every stake at the deal and pays the pot at the
   * end, and blackjack does neither.
   */
  async act(room, seatId, action, deps) {
    const move = action as { type?: string; index?: number; ruleset?: string };
    switch (move.type) {
      case "roll":
        room.doRoll(seatId);
        return;
      case "toggle":
        room.toggle(seatId, Number(move.index));
        return;
      case "bank":
        room.bank(seatId);
        return;
      case "playAgain":
        room.playAgain(seatId);
        return;
      case "start": {
        // Every stake before a card is dealt, and anything already taken put
        // back if one of them cannot pay. Nobody ends up half-way into a game.
        const paid: string[] = [];
        if (room.buyIn > 0) {
          for (const seat of room.seats) {
            if (seat.userId === null) {
              continue;
            }
            if (await deps.take(seat.userId, room.buyIn)) {
              paid.push(seat.userId);
            } else {
              for (const refund of paid) {
                await deps.give(refund, room.buyIn);
              }
              throw new Error(`${seat.name} cannot cover the buy-in.`);
            }
          }
        }
        try {
          room.start(seatId);
        } catch (error) {
          for (const refund of paid) {
            await deps.give(refund, room.buyIn);
          }
          throw error;
        }
        return;
      }
      default:
        throw new Error("That is not something you can do here.");
    }
  },

  isSettled(room) {
    return room.status === "over";
  },

  /** The pot to the winners, split evenly, remainder to the earliest seated. */
  async settle(room, deps) {
    const winners = room.seats.filter((seat) => room.winnerIds.includes(seat.id));
    const share = winners.length > 0 ? Math.floor(room.pot / winners.length) : 0;
    const remainder = room.pot - share * winners.length;

    for (const [index, seat] of winners.entries()) {
      if (seat.userId === null) {
        continue;
      }
      const amount = share + (index === 0 ? remainder : 0);
      if (amount > 0) {
        await deps.give(seat.userId, amount);
      }
    }

    for (const seat of room.seats) {
      // Somebody who arrived mid-game paid no stake and took no turn.
      if (seat.userId === null || seat.waiting) {
        continue;
      }
      const won = room.winnerIds.includes(seat.id);
      await deps.record(seat.userId, {
        shared: {
          games: 1,
          wins: won ? 1 : 0,
          chipsWon: won ? share - room.buyIn : -room.buyIn,
        },
        game: GREED.id,
        // A best turn is a maximum and only the game knows that.
        max: { bestTurn: seat.score },
      });
    }

    await deps.finished({
      code: room.code,
      rulesetName: room.ruleset.name,
      buyIn: room.buyIn,
      pot: room.pot,
      players: room.seats
        .filter((seat) => !seat.waiting)
        .map((seat) => ({
          userId: seat.userId,
          name: seat.name,
          score: seat.score,
          isBot: seat.isBot,
        })),
      winnerIds: winners.map((seat) => seat.userId ?? seat.id),
      endedAt: Date.now(),
    });
  },

  clock(room): Clock | null {
    const seconds = room.ruleset.turnTimerSeconds;
    const active = room.activeSeat();
    if (seconds === null || seconds <= 0 || active === null || room.status !== "playing") {
      return null;
    }
    return { seatId: active.id, endsAt: Date.now() + seconds * 1000 };
  },

  timeout(room, seatId) {
    room.timeout(seatId);
  },

  botMove(room): BotMove | null {
    const seat = room.activeSeat();
    if (seat === null || !seat.isBot || room.status !== "playing") {
      return null;
    }
    const turn = room.view(null).turn;
    if (turn === null) {
      return null;
    }
    const skill = seat.skill ?? "normal";
    return {
      seatId: seat.id,
      delayMs: thinkingTime(skill),
      play() {
        const choice = decide({
          dice: turn.dice,
          kept: room.keptThisTurn,
          onBoard: seat.onBoard,
          mustBeat: room.deficitOnFinalTurn(),
          rules: room.ruleset,
          gateKey: comboGateKeyFor(room.ruleset),
          skill,
        });
        if (choice === null) {
          return;
        }
        for (const index of choice.keep) {
          room.toggle(seat.id, index);
        }
        if (choice.action === "bank") {
          room.bank(seat.id);
        } else {
          room.doRoll(seat.id);
        }
      },
    };
  },

  /** The busting dice stay on screen for a beat before play moves on. */
  pause(room) {
    if (room.view(null).turn?.phase !== "farkled") {
      return null;
    }
    return {
      ms: 1400,
      then() {
        room.advanceTurn();
      },
    };
  },
  };
}
