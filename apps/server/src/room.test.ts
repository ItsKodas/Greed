import { DEFAULT_RULESET } from "@greed/rules";
import type { Die } from "@greed/rules";
import { describe, expect, it } from "vitest";
import { Room, RoomError } from "./room.js";

/** A roller that hands out scripted rolls in order, so nothing is random. */
function scripted(...rolls: Die[][]) {
  let call = 0;
  return (count: number): Die[] => {
    const next = rolls[call];
    call += 1;
    if (next === undefined) {
      throw new Error(`roller ran out after ${call - 1} rolls (asked for ${count})`);
    }
    return next;
  };
}

function twoPlayerGame(...rolls: Die[][]): Room {
  const room = new Room("TEST1", scripted(...rolls));
  room.join("a", "Ada");
  room.join("b", "Bo");
  room.start("a");
  return room;
}

/** Indices of dice showing a given face, for readable selections. */
function pick(room: Room, ...indices: number[]): void {
  const seatId = room.view().turn?.seatId as string;
  for (const index of indices) {
    room.toggle(seatId, index);
  }
}

describe("lobby", () => {
  it("seats players and makes the first one host", () => {
    const room = new Room("TEST1", scripted());
    room.join("a", "Ada");
    room.join("b", "Bo");
    const view = room.view();
    expect(view.seats.map((s) => s.name)).toEqual(["Ada", "Bo"]);
    expect(view.seats[0]?.isHost).toBe(true);
    expect(view.seats[1]?.isHost).toBe(false);
  });

  it("trims and caps names, and rejects blank ones", () => {
    const room = new Room("TEST1", scripted());
    expect(room.join("a", "  Ada  ").name).toBe("Ada");
    expect(room.join("b", "x".repeat(50)).name).toHaveLength(20);
    expect(() => room.join("c", "   ")).toThrow(RoomError);
  });

  it("refuses to start without two players", () => {
    const room = new Room("TEST1", scripted());
    room.join("a", "Ada");
    expect(() => room.start("a")).toThrow(/at least 2/i);
  });

  it("lets only the host start", () => {
    const room = new Room("TEST1", scripted());
    room.join("a", "Ada");
    room.join("b", "Bo");
    expect(() => room.start("b")).toThrow(/host/i);
  });

  it("refuses joins once play has begun", () => {
    const room = twoPlayerGame();
    expect(() => room.join("c", "Cy")).toThrow(/already started/i);
  });

  it("removes a seat that leaves during the lobby", () => {
    const room = new Room("TEST1", scripted());
    room.join("a", "Ada");
    room.join("b", "Bo");
    room.disconnect("b");
    expect(room.view().seats).toHaveLength(1);
  });
});

describe("turn ownership", () => {
  it("rejects actions from the player whose turn it is not", () => {
    const room = twoPlayerGame([1, 2, 3, 4, 6, 6]);
    expect(() => room.doRoll("b")).toThrow(/not your turn/i);
    room.doRoll("a");
    expect(() => room.toggle("b", 0)).toThrow(/not your turn/i);
    expect(() => room.bank("b")).toThrow(/not your turn/i);
  });

  it("rejects toggling before the dice are rolled", () => {
    const room = twoPlayerGame();
    expect(() => room.toggle("a", 0)).toThrow(/roll first/i);
  });

  it("rejects an out-of-range die index", () => {
    const room = twoPlayerGame([1, 2, 3, 4, 6, 6]);
    room.doRoll("a");
    expect(() => room.toggle("a", 6)).toThrow(/no such die/i);
    expect(() => room.toggle("a", -1)).toThrow(/no such die/i);
  });

  it("rejects picking up a die that cannot score", () => {
    // 1 scores; 2, 3, 4, 6 are dead with no triple among them.
    const room = twoPlayerGame([1, 2, 3, 4, 6, 6]);
    room.doRoll("a");
    expect(() => room.toggle("a", 1)).toThrow(/cannot score/i);
  });
});

describe("selecting and banking", () => {
  it("reports what the selection is worth as dice are picked up", () => {
    const room = twoPlayerGame([1, 5, 2, 3, 4, 6]);
    room.doRoll("a");
    expect(room.view().turn?.selection).toBe(0);
    pick(room, 0);
    expect(room.view().turn?.selection).toBe(100);
    pick(room, 1);
    expect(room.view().turn?.selection).toBe(150);
  });

  it("refuses to bank an empty selection", () => {
    const room = twoPlayerGame([1, 5, 2, 3, 4, 6]);
    room.doRoll("a");
    expect(() => room.bank("a")).toThrow(/at least one/i);
  });

  it("refuses to bank below the entry threshold", () => {
    const room = twoPlayerGame([1, 2, 3, 4, 6, 6]);
    room.doRoll("a");
    pick(room, 0); // 100, under the 500 threshold
    expect(() => room.bank("a")).toThrow(/on the board/i);
  });

  it("banks once the threshold is met and passes the turn", () => {
    const room = twoPlayerGame([1, 1, 1, 2, 3, 4]);
    room.doRoll("a");
    pick(room, 0, 1, 2); // three 1s = 1000
    room.bank("a");
    const view = room.view();
    expect(view.seats[0]?.score).toBe(1000);
    expect(view.seats[0]?.onBoard).toBe(true);
    expect(view.turn?.seatId).toBe("b");
    expect(view.turn?.phase).toBe("awaiting_roll");
  });

  it("lets a player on the board bank any amount afterwards", () => {
    const room = twoPlayerGame([1, 1, 1, 2, 3, 4], [1, 2, 3, 4, 6, 6], [5, 2, 3, 4, 6, 6]);
    room.doRoll("a");
    pick(room, 0, 1, 2);
    room.bank("a"); // Ada on the board with 1000
    room.doRoll("b");
    pick(room, 0);
    expect(() => room.bank("b")).toThrow(/on the board/i); // Bo still needs 500
    room.advanceTurn();
    room.doRoll("a");
    pick(room, 0);
    room.bank("a"); // 50 is fine now
    expect(room.view().seats[0]?.score).toBe(1050);
  });
});

describe("rolling on", () => {
  it("carries the selection into the turn total and rolls what is left", () => {
    const room = twoPlayerGame([1, 1, 2, 3, 4, 6], [5, 2]);
    room.doRoll("a");
    pick(room, 0, 1); // two 1s = 200
    room.doRoll("a");
    const view = room.view();
    expect(view.turn?.kept).toBe(200);
    expect(view.turn?.dice).toHaveLength(2);
  });

  it("gives hot dice when all six are set aside", () => {
    const room = twoPlayerGame([1, 2, 3, 4, 5, 6], [1, 1, 1, 2, 3, 4]);
    room.doRoll("a");
    pick(room, 0, 1, 2, 3, 4, 5); // a straight, all six
    room.doRoll("a");
    const view = room.view();
    expect(view.turn?.kept).toBe(1500);
    expect(view.turn?.dice).toHaveLength(6);
  });

  it("refuses to roll on with an illegal selection", () => {
    const room = twoPlayerGame([1, 1, 2, 3, 4, 6]);
    room.doRoll("a");
    expect(() => room.doRoll("a")).toThrow(/at least one/i);
  });
});

describe("farkle", () => {
  it("wipes the turn total and marks the turn finished", () => {
    const room = twoPlayerGame([1, 1, 2, 3, 4, 6], [2, 3]);
    room.doRoll("a");
    pick(room, 0, 1);
    room.doRoll("a"); // 2 and 3 score nothing
    const view = room.view();
    expect(view.turn?.phase).toBe("farkled");
    expect(view.turn?.kept).toBe(0);
    expect(view.lastEvent).toMatch(/farkled/i);
    expect(view.seats[0]?.score).toBe(0);
  });

  it("refuses further action until the turn is advanced", () => {
    const room = twoPlayerGame([2, 3, 4, 6, 6, 4]);
    room.doRoll("a");
    expect(() => room.doRoll("a")).toThrow(/finished/i);
    room.advanceTurn();
    expect(room.view().turn?.seatId).toBe("b");
  });
});

describe("disconnects", () => {
  it("passes the turn on when the active player drops", () => {
    const room = twoPlayerGame();
    room.disconnect("a");
    expect(room.view().turn?.seatId).toBe("b");
    expect(room.view().seats[0]?.connected).toBe(false);
  });

  it("skips disconnected seats when advancing", () => {
    const room = new Room("TEST1", scripted([1, 1, 1, 2, 3, 4]));
    room.join("a", "Ada");
    room.join("b", "Bo");
    room.join("c", "Cy");
    room.start("a");
    room.disconnect("b");
    room.doRoll("a");
    pick(room, 0, 1, 2);
    room.bank("a");
    expect(room.view().turn?.seatId).toBe("c");
  });

  it("lets a seat come back", () => {
    const room = twoPlayerGame();
    room.disconnect("b");
    room.reconnect("b");
    expect(room.view().seats[1]?.connected).toBe(true);
  });
});

describe("finishing", () => {
  it("gives everyone one more turn once someone reaches the target", () => {
    const room = new Room("TEST1", scripted([1, 1, 1, 1, 1, 1], [1, 1, 1, 2, 3, 4]), {
      ...DEFAULT_RULESET,
      targetScore: 5000,
    });
    room.join("a", "Ada");
    room.join("b", "Bo");
    room.start("a");

    room.doRoll("a");
    pick(room, 0, 1, 2, 3, 4, 5); // six 1s = 8000
    room.bank("a");

    expect(room.view().status).toBe("playing");
    expect(room.view().turn?.seatId).toBe("b");
    expect(room.view().lastEvent).toMatch(/one last turn/i);

    room.doRoll("b");
    pick(room, 0, 1, 2);
    room.bank("b"); // Bo banks 1000, still behind

    const view = room.view();
    expect(view.status).toBe("over");
    expect(view.winnerIds).toEqual(["a"]);
    expect(view.lastEvent).toMatch(/ada wins/i);
  });

  it("ends immediately when the final round is disabled", () => {
    const room = new Room("TEST1", scripted([1, 1, 1, 1, 1, 1]), {
      ...DEFAULT_RULESET,
      targetScore: 5000,
      finalRound: false,
    });
    room.join("a", "Ada");
    room.join("b", "Bo");
    room.start("a");
    room.doRoll("a");
    pick(room, 0, 1, 2, 3, 4, 5);
    room.bank("a");
    expect(room.view().status).toBe("over");
    expect(room.view().winnerIds).toEqual(["a"]);
  });

  it("reports a tie", () => {
    const room = new Room("TEST1", scripted([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]), {
      ...DEFAULT_RULESET,
      targetScore: 5000,
    });
    room.join("a", "Ada");
    room.join("b", "Bo");
    room.start("a");
    room.doRoll("a");
    pick(room, 0, 1, 2, 3, 4, 5);
    room.bank("a");
    room.doRoll("b");
    pick(room, 0, 1, 2, 3, 4, 5);
    room.bank("b");
    const view = room.view();
    expect(view.status).toBe("over");
    expect(view.winnerIds).toHaveLength(2);
    expect(view.lastEvent).toMatch(/tie/i);
  });
});

describe("the view", () => {
  it("marks dead dice and keeps triples clickable one at a time", () => {
    const room = twoPlayerGame([2, 2, 2, 3, 4, 6]);
    room.doRoll("a");
    const view = room.view();
    // The three 2s form a triple, so each is live even though one alone scores nothing.
    expect(view.turn?.dead.slice(0, 3)).toEqual([false, false, false]);
    expect(view.turn?.dead.slice(3)).toEqual([true, true, true]);
    // And picking them one at a time works.
    pick(room, 0, 1, 2);
    expect(room.view().turn?.selection).toBe(200);
  });

  it("reports the bust chance for the dice that would be rolled next", () => {
    const room = twoPlayerGame([1, 1, 2, 3, 4, 6]);
    room.doRoll("a");
    pick(room, 0, 1);
    // Four dice would be rerolled: 204 / 1296.
    expect(room.view().turn?.nextRollCount).toBe(4);
    expect(room.view().turn?.bustChance).toBeCloseTo(204 / 1296, 6);
  });

  it("reports six dice and the six-dice bust chance at the start of a turn", () => {
    const room = twoPlayerGame();
    expect(room.view().turn?.nextRollCount).toBe(6);
    expect(room.view().turn?.bustChance).toBeCloseTo(1080 / 46656, 6);
  });
});
