import type { FinishedGame, GameDeps, StatBumpLike } from "@backroom/core";
import type { Die } from "@backroom/rules";
import { describe, expect, it } from "vitest";
import { greedAdapter } from "./adapter.js";
import type { Room } from "./room.js";

/** Records everything a game asks the economy to do, and does none of it. */
function ledger() {
  const recorded: Array<{ userId: string; bump: StatBumpLike }> = [];
  const finished: FinishedGame[] = [];
  const given: Array<{ userId: string; amount: number }> = [];
  const deps: GameDeps = {
    take: async () => true,
    give: async (userId, amount) => {
      given.push({ userId, amount });
    },
    record: async (userId, bump) => {
      recorded.push({ userId, bump });
    },
    finished: async (record) => {
      finished.push(record);
    },
  };
  return { deps, recorded, finished, given };
}

const who = (n: number) => ({ userId: `u${n}`, avatar: null, accentColor: null });

/** Sixes every throw, so the first player banks their way to the target alone. */
const sixes = () => [6, 6, 6, 6, 6, 6] as Die[];

/** Plays a whole game out to a winner, at whatever stake the table is set to. */
function playOut(buyIn: number): Room {
  const adapter = greedAdapter({ roll: sixes });
  const room = adapter.create("TEST1") as Room;
  room.join("a", "Ada", who(1));
  room.join("b", "Bram", who(2));
  room.setBuyIn(buyIn);
  room.start("a");

  // Six sixes is 3,000 a throw with hot dice, so this ends quickly either way.
  for (let guard = 0; guard < 200 && room.status !== "over"; guard += 1) {
    const turn = room.view(null).turn;
    if (turn === null) {
      break;
    }
    if (turn.phase === "awaiting_roll") {
      room.doRoll(turn.seatId);
      continue;
    }
    if (turn.phase === "selecting") {
      for (const [index, held] of turn.held.entries()) {
        if (!held) {
          room.toggle(turn.seatId, index);
        }
      }
      room.bank(turn.seatId);
      continue;
    }
    break;
  }
  return room;
}

describe("what a finished game is worth", () => {
  it("puts a game played for chips on both players' records", async () => {
    const adapter = greedAdapter({ roll: sixes });
    const room = playOut(500);
    expect(room.status).toBe("over");

    const book = ledger();
    await adapter.settle(room, book.deps);

    expect(book.recorded).toHaveLength(2);
    expect(book.recorded.map((entry) => entry.bump.shared?.games)).toEqual([1, 1]);
    /*
     * However many won, that is how many wins are recorded. Taken from the
     * room rather than assumed: the final round lets two players reach the
     * target in the same round, and a tie is a real result here.
     */
    expect(book.recorded.filter((entry) => entry.bump.shared?.wins === 1)).toHaveLength(
      room.winnerIds.length,
    );
    expect(room.winnerIds.length).toBeGreaterThan(0);
    // The pot was shared out among them, and nobody else was paid.
    expect(book.given.length).toBe(room.winnerIds.length);
    expect(book.finished).toHaveLength(1);
    expect(book.finished[0]?.buyIn).toBe(500);
  });

  it("keeps a friendly game off the record entirely", async () => {
    /*
     * Nothing was staked, so there is nothing to have won or lost. Counting
     * these made a win rate mean two things at once and filled the history
     * with rows that all read +0.
     */
    const adapter = greedAdapter({ roll: sixes });
    const room = playOut(0);
    expect(room.status).toBe("over");

    const book = ledger();
    await adapter.settle(room, book.deps);

    expect(book.recorded).toEqual([]);
    expect(book.finished).toEqual([]);
    // And no chips moved, because none were ever taken.
    expect(book.given).toEqual([]);
  });
});
