import type { AddressInfo } from "node:net";
import type { Die } from "@greed/rules";
import type { Ack, ClientToServer, RoomView, ServerToClient } from "@greed/shared";
import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGreedServer, resolveSessionSecret, resolveTrustProxy } from "./server.js";
import type { GreedServer } from "./server.js";

/**
 * These drive the real socket layer with real clients.
 *
 * The room engine is tested directly elsewhere; what is only reachable here is
 * everything between a client and that engine — validation, host checks, the
 * farkle pause, bots, broadcast fan-out and disconnects. Both of the worst
 * bugs this project has had lived at exactly that seam and neither was
 * reachable from a unit test.
 */

type Client = Socket<ServerToClient, ClientToServer> & { latest?: RoomView };

let server: GreedServer;
let port: number;
const open: Client[] = [];

/** A roller that hands out scripted rolls in order, then repeats the last. */
function scripted(...rolls: Die[][]) {
  let call = 0;
  return (): Die[] => {
    const next = rolls[Math.min(call, rolls.length - 1)] ?? [1, 1, 1, 1, 1, 1];
    call += 1;
    return next;
  };
}

async function start(roll?: () => Die[]): Promise<void> {
  server = createGreedServer({
    roll,
    serveClient: false,
    farklePauseMs: 30,
    botDelayMs: 5,
    reconnectGraceMs: 300,
    emptyRoomTtlMs: 200,
  });
  await new Promise<void>((resolve) => {
    server.http.listen(0, () => resolve());
  });
  port = (server.http.address() as AddressInfo).port;
}

function client(): Promise<Client> {
  return new Promise((resolve) => {
    const socket: Client = connect(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    // Remember the most recent state. Without this every assertion races the
    // broadcast that a create or join triggers immediately.
    socket.on("room:state", (state) => {
      socket.latest = state;
    });
    socket.on("connect", () => resolve(socket));
  });
}

/** Waits until a state arrives that satisfies the predicate, or times out. */
function stateWhere(socket: Client, ok: (state: RoomView) => boolean, ms = 2500): Promise<RoomView> {
  const already = socket.latest;
  if (already !== undefined && ok(already)) {
    return Promise.resolve(already);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("room:state", listener);
      reject(new Error("no matching state in time"));
    }, ms);
    const listener = (state: RoomView) => {
      if (ok(state)) {
        clearTimeout(timer);
        socket.off("room:state", listener);
        resolve(state);
      }
    };
    socket.on("room:state", listener);
  });
}

function create(socket: Client, name: string, ruleset?: string): Promise<Ack> {
  return new Promise((resolve) => socket.emit("lobby:create", { name, ruleset }, resolve));
}

function join(socket: Client, name: string, code: string): Promise<Ack> {
  return new Promise((resolve) => socket.emit("lobby:join", { name, code }, resolve));
}

function nextError(socket: Client): Promise<string> {
  return new Promise((resolve) => socket.once("room:error", resolve));
}

beforeEach(async () => {
  await start();
});

afterEach(async () => {
  for (const socket of open.splice(0)) {
    socket.close();
  }
  await server.close();
});

describe("opening and joining a table", () => {
  it("gives the host a code and seats them", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    expect(ack.ok).toBe(true);
    if (!ack.ok) {
      return;
    }
    expect(ack.code).toHaveLength(5);

    const state = await stateWhere(host, (view) => view.seats.length === 1);
    expect(state.seats[0]?.name).toBe("Ada");
    expect(state.seats[0]?.isHost).toBe(true);
  });

  it("tells both players about the other", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);

    const state = await stateWhere(host, (view) => view.seats.length === 2);
    expect(state.seats.map((seat) => seat.name)).toEqual(["Ada", "Bo"]);
  });

  it("accepts a lower-case code", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    const joined = await join(guest, "Bo", ack.code.toLowerCase());
    expect(joined.ok).toBe(true);
  });

  it("refuses a code that does not exist", async () => {
    const guest = await client();
    const ack = await join(guest, "Bo", "ABCDE");
    expect(ack).toEqual({ ok: false, error: "No table with that code." });
  });
});

describe("rejecting malformed input", () => {
  it("refuses a blank name instead of seating an unnamed player", async () => {
    const host = await client();
    const ack = await create(host, "   ");
    expect(ack.ok).toBe(false);
  });

  it("refuses a name longer than the limit", async () => {
    const host = await client();
    const ack = await create(host, "x".repeat(500));
    expect(ack.ok).toBe(false);
  });

  it("refuses a code of the wrong shape", async () => {
    const guest = await client();
    const ack = await join(guest, "Bo", "nope");
    expect(ack.ok).toBe(false);
  });

  it("survives a toggle with a nonsense index", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");
    host.emit("game:roll");
    await stateWhere(host, (view) => (view.turn?.dice.length ?? 0) > 0);

    // Deliberately not a number. Before validation this reached the engine.
    (host as unknown as { emit: (event: string, payload: unknown) => void }).emit("game:toggle", {
      index: "banana",
    });
    (host as unknown as { emit: (event: string, payload: unknown) => void }).emit("game:toggle", {
      index: 99,
    });

    // The server is still answering, which is the whole point.
    host.emit("game:roll");
    const state = await stateWhere(host, (view) => (view.turn?.rollSeq ?? 0) >= 1);
    expect(state.status).toBe("playing");
  });
});

describe("host-only controls", () => {
  it("stops a guest starting the game", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);

    const complaint = nextError(guest);
    guest.emit("game:start");
    expect(await complaint).toMatch(/host/i);
  });

  it("stops a guest adding a bot", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);

    const complaint = nextError(guest);
    guest.emit("lobby:addBot", { skill: "normal" });
    expect(await complaint).toMatch(/host/i);
  });

  it("lets the host change the rules, and everyone sees it", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("lobby:setRules", { targetScore: 4000, entryThreshold: 0 });
    const state = await stateWhere(host, (view) => view.ruleset.targetScore === 4000);
    expect(state.ruleset.entryThreshold).toBe(0);
  });

  it("refuses a rule change outside its bounds", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const before = await stateWhere(host, (view) => view.seats.length === 1);
    host.emit("lobby:setRules", { targetScore: 999_999_999 });
    // Nothing should move; give it a moment to prove nothing does.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(before.ruleset.targetScore).toBe(10_000);
  });
});

describe("playing a turn", () => {
  it("carries a whole turn from roll to bank", async () => {
    await server.close();
    // Three 1s, then whatever: 1,000 clears the 500 threshold.
    await start(scripted([1, 1, 1, 2, 3, 4]));

    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");

    host.emit("game:roll");
    await stateWhere(host, (view) => (view.turn?.dice.length ?? 0) === 6);

    host.emit("game:toggle", { index: 0 });
    host.emit("game:toggle", { index: 1 });
    const picked = await stateWhere(host, (view) => (view.turn?.selection ?? 0) === 200);
    expect(picked.turn?.selectionValid).toBe(true);

    host.emit("game:toggle", { index: 2 });
    await stateWhere(host, (view) => (view.turn?.selection ?? 0) === 1000);

    host.emit("game:bank");
    const banked = await stateWhere(host, (view) => (view.seats[0]?.score ?? 0) === 1000);
    expect(banked.seats[0]?.onBoard).toBe(true);
  });

  it("refuses a bank under the entry threshold, with a reason", async () => {
    await server.close();
    await start(scripted([1, 2, 3, 4, 6, 6]));

    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");
    host.emit("game:roll");
    await stateWhere(host, (view) => (view.turn?.dice.length ?? 0) === 6);
    host.emit("game:toggle", { index: 0 });
    await stateWhere(host, (view) => (view.turn?.selection ?? 0) === 100);

    const complaint = nextError(host);
    host.emit("game:bank");
    expect(await complaint).toMatch(/on the board/i);
  });

  it("moves play on by itself after a farkle", async () => {
    await server.close();
    // Ada rolls nothing at all.
    await start(scripted([2, 3, 4, 6, 6, 4]));

    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");

    host.emit("game:roll");
    await stateWhere(host, (view) => view.turn?.phase === "farkled");
    // The pause is the server's job; nobody has to click anything.
    const passed = await stateWhere(host, (view) => view.turn?.seatId === view.seats[1]?.id);
    expect(passed.turn?.phase).toBe("awaiting_roll");
  });
});

describe("bots", () => {
  it("take their own turn without anyone touching them", async () => {
    await server.close();
    await start(scripted([1, 1, 1, 2, 3, 4]));

    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("lobby:addBot", { skill: "normal" });
    await stateWhere(host, (view) => view.seats.length === 2);
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");

    // Ada banks, then the bot plays unaided.
    host.emit("game:roll");
    await stateWhere(host, (view) => (view.turn?.dice.length ?? 0) === 6);
    host.emit("game:toggle", { index: 0 });
    host.emit("game:toggle", { index: 1 });
    host.emit("game:toggle", { index: 2 });
    await stateWhere(host, (view) => (view.turn?.selection ?? 0) === 1000);
    host.emit("game:bank");

    const botScored = await stateWhere(
      host,
      (view) => (view.seats[1]?.score ?? 0) > 0 || view.seats[1]?.onBoard === true,
    );
    expect(botScored.seats[1]?.isBot).toBe(true);
  });

  it("do not freeze the table when they farkle", async () => {
    await server.close();
    // Every roll scores nothing, so the bot must farkle and hand back.
    await start(scripted([2, 3, 4, 6, 6, 4]));

    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    host.emit("lobby:addBot", { skill: "normal" });
    await stateWhere(host, (view) => view.seats.length === 2);
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");

    host.emit("game:roll");
    await stateWhere(host, (view) => view.turn?.seatId === view.seats[1]?.id);
    // The bot farkles too; play must come back to Ada rather than stalling.
    const back = await stateWhere(host, (view) => view.turn?.seatId === view.seats[0]?.id);
    expect(back.status).toBe("playing");
  });
});

describe("leaving and coming back", () => {
  it("gives up the seat at once on a deliberate leave", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);
    await stateWhere(host, (view) => view.seats.length === 2);

    guest.emit("lobby:leave");
    const alone = await stateWhere(host, (view) => view.seats.length === 1);
    expect(alone.seats[0]?.name).toBe("Ada");
  });

  it("holds a seat through a drop and hands it back on resume", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    const joined = await join(guest, "Bo", ack.code);
    if (!joined.ok) {
      throw new Error("join failed");
    }
    await stateWhere(host, (view) => view.seats.length === 2);

    guest.close();
    await stateWhere(host, (view) => view.seats[1]?.connected === false);

    const again = await client();
    const resumed = await new Promise<Ack>((resolve) =>
      again.emit("lobby:resume", { seatId: joined.seatId, code: ack.code }, resolve),
    );
    expect(resumed.ok).toBe(true);
    const back = await stateWhere(host, (view) => view.seats[1]?.connected === true);
    expect(back.seats).toHaveLength(2);
  });

  it("does not end a game just because everyone dropped at once", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);
    await stateWhere(host, (view) => view.seats.length === 2);
    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");

    host.close();
    guest.close();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const room = server.rooms.get(ack.code);
    expect(room?.status).toBe("playing");
    expect(room?.winnerIds).toEqual([]);
  });
});

describe("chat", () => {
  it("reaches everyone at the table", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const guest = await client();
    await join(guest, "Bo", ack.code);
    await stateWhere(host, (view) => view.seats.length === 2);

    const heard = new Promise<{ name: string; text: string }>((resolve) =>
      host.once("chat:message", resolve),
    );
    guest.emit("chat:send", { text: "your roll" });
    const message = await heard;
    expect(message.name).toBe("Bo");
    expect(message.text).toBe("your roll");
  });

  it("drops an empty message rather than broadcasting it", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    let heard = false;
    host.on("chat:message", () => {
      heard = true;
    });
    host.emit("chat:send", { text: "   " });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(heard).toBe(false);
  });

  it("throttles someone flooding the table", async () => {
    const host = await client();
    const ack = await create(host, "Ada");
    if (!ack.ok) {
      throw new Error("create failed");
    }
    const complaint = nextError(host);
    for (let index = 0; index < 12; index += 1) {
      host.emit("chat:send", { text: `spam ${index}` });
    }
    expect(await complaint).toMatch(/chat/i);
  });
});

describe("the session secret", () => {
  const was = process.env["NODE_ENV"];
  afterEach(() => {
    process.env["NODE_ENV"] = was;
  });

  it("uses a real secret when one is given", () => {
    process.env["NODE_ENV"] = "production";
    expect(resolveSessionSecret("a-real-secret")).toBe("a-real-secret");
  });

  it("falls back to the development default off production", () => {
    process.env["NODE_ENV"] = "development";
    expect(resolveSessionSecret(undefined)).toBe("greed-development-secret");
  });

  it("refuses to start in production without one", () => {
    process.env["NODE_ENV"] = "production";
    // The default is published in this repository, so signing production
    // cookies with it would let anyone forge a session.
    expect(() => resolveSessionSecret(undefined)).toThrow(/SESSION_SECRET/);
    expect(() => resolveSessionSecret("")).toThrow(/SESSION_SECRET/);
  });
});

describe("how much of a proxy to believe", () => {
  const was = process.env["NODE_ENV"];
  afterEach(() => {
    process.env["NODE_ENV"] = was;
  });

  it("trusts one proxy in production when nothing is configured", () => {
    process.env["NODE_ENV"] = "production";
    expect(resolveTrustProxy(undefined)).toBe(1);
  });

  it("treats an empty string as unset", () => {
    process.env["NODE_ENV"] = "production";
    // Compose writes ${VAR:-} for anything missing from .env, so "not set"
    // reaches a container as "" rather than undefined. A ?? here reads
    // correctly and never fires, which cost a working sign-in once already.
    expect(resolveTrustProxy("")).toBe(1);
    expect(resolveTrustProxy("   ")).toBe(1);
  });

  it("trusts nothing in development", () => {
    process.env["NODE_ENV"] = "development";
    expect(resolveTrustProxy(undefined)).toBeNull();
    expect(resolveTrustProxy("")).toBeNull();
  });

  it("takes a hop count, a boolean or an address", () => {
    expect(resolveTrustProxy("2")).toBe(2);
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("loopback")).toBe("loopback");
    expect(resolveTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });
});

describe("who gets told what", () => {
  /*
   * The table is sent to each socket separately rather than to the room as a
   * whole, so that a game with something face down can answer each seat
   * differently. The risk in that change is silent: a loop that misses a
   * socket looks exactly like a working table until somebody stops updating.
   */
  it("reaches every seat at the table", async () => {
    await start(() => [1, 2, 3, 4, 5, 6] as Die[]);

    const host = await client();
    const created = await create(host, "Ada");
    const code = created.ok ? created.code : "";

    const guest = await client();
    await join(guest, "Bo", code);

    const third = await client();
    await join(third, "Cass", code);

    // One action, and every socket at the table must hear about it.
    const heard = [host, guest, third].map((socket) =>
      stateWhere(socket, (state) => state.seats.length === 3),
    );
    host.emit("lobby:setRules", { targetScore: 5000 });
    const views = await Promise.all(heard);

    expect(views).toHaveLength(3);
    for (const view of views) {
      expect(view.seats).toHaveLength(3);
    }
  });

  it("tells each seat about itself", async () => {
    await start();
    const host = await client();
    const created = await create(host, "Ada");
    const code = created.ok ? created.code : "";
    const guest = await client();
    const joined = await join(guest, "Bo", code);

    const hostView = await stateWhere(host, (state) => state.seats.length === 2);
    const guestView = await stateWhere(guest, (state) => state.seats.length === 2);

    // Same table, and each socket holds the seat it was given.
    expect(hostView.code).toBe(guestView.code);
    expect(created.ok && joined.ok && created.seatId !== joined.seatId).toBe(true);
  });
});

describe("playing again at the same table", () => {
  it("returns the table to its lobby with the seat still in it", async () => {
    // Six ones is 8,000, so one banked turn wins against a 2,000 target.
    await start(() => [1, 1, 1, 1, 1, 1] as Die[]);
    const host = await client();
    const created = await create(host, "Ada");
    const code = created.ok ? created.code : "";

    host.emit("lobby:setRules", { targetScore: 2000 });
    await stateWhere(host, (state) => state.ruleset.targetScore === 2000);

    host.emit("game:start");
    await stateWhere(host, (state) => state.status === "playing");
    host.emit("game:roll");
    await stateWhere(host, (state) => (state.turn?.dice.length ?? 0) === 6);
    for (let index = 0; index < 6; index += 1) {
      host.emit("game:toggle", { index });
    }
    await stateWhere(host, (state) => (state.turn?.selection ?? 0) > 0);
    host.emit("game:bank");
    const over = await stateWhere(host, (state) => state.status === "over");
    expect(over.seats[0]?.score).toBeGreaterThanOrEqual(2000);

    host.emit("game:playAgain");
    const again = await stateWhere(host, (state) => state.status === "lobby");

    // Same table, same seat, scores wiped, ready to be dealt again.
    expect(again.code).toBe(code);
    expect(again.seats).toHaveLength(1);
    expect(again.seats[0]?.name).toBe("Ada");
    expect(again.seats[0]?.score).toBe(0);
    expect(again.turn).toBeNull();
    expect(again.ruleset.targetScore).toBe(2000);

    // And it can actually be dealt again.
    host.emit("game:start");
    await stateWhere(host, (state) => state.status === "playing");
  });

  it("will not deal another game while one is running", async () => {
    await start(() => [1, 1, 1, 1, 1, 1] as Die[]);
    const host = await client();
    await create(host, "Ada");
    host.emit("game:start");
    await stateWhere(host, (state) => state.status === "playing");

    const complaint = nextError(host);
    host.emit("game:playAgain");
    expect(await complaint).toMatch(/still going/i);
  });
});
