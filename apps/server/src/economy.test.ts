import type { AddressInfo } from "node:net";
import type { Die } from "@greed/rules";
import type { Ack, ClientToServer, RoomView, ServerToClient } from "@greed/shared";
import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGreedServer } from "./server.js";
import type { GreedServer } from "./server.js";
import {
  DAILY_FLOOR,
  DAILY_GRANT,
  MemoryStore,
  STARTING_CHIPS,
  emptyStats,
  judgeDaily,
} from "./store.js";
import type { Profile } from "./store.js";

type Client = Socket<ServerToClient, ClientToServer> & { latest?: RoomView };

let server: GreedServer | null = null;
const open: Client[] = [];

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    discordId: "d1",
    name: "Ada",
    avatar: null,
    accentColor: null,
    chips: STARTING_CHIPS,
    lastDailyClaim: null,
    stats: emptyStats(),
    ...overrides,
  };
}

afterEach(async () => {
  for (const socket of open.splice(0)) {
    socket.close();
  }
  if (server !== null) {
    await server.close();
    server = null;
  }
});

describe("the daily top-up rule", () => {
  it("is refused while a player still has chips", () => {
    const verdict = judgeDaily(profile({ chips: DAILY_FLOOR }), Date.now());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("not-needed");
  });

  it("is granted to someone who has run dry", () => {
    const verdict = judgeDaily(profile({ chips: 50 }), Date.now());
    expect(verdict.ok).toBe(true);
    expect(verdict.granted).toBe(DAILY_GRANT);
  });

  it("cannot be claimed twice in a day", () => {
    const now = Date.now();
    const verdict = judgeDaily(profile({ chips: 50, lastDailyClaim: now - 1000 }), now);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("too-soon");
    expect(verdict.nextAt).toBeGreaterThan(now);
  });

  it("comes round again after the interval", () => {
    const now = Date.now();
    const longAgo = now - 25 * 60 * 60 * 1000;
    expect(judgeDaily(profile({ chips: 50, lastDailyClaim: longAgo }), now).ok).toBe(true);
  });
});

describe("the memory store", () => {
  it("starts a new profile with the opening stack", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(person.chips).toBe(STARTING_CHIPS);
  });

  it("does not reset a balance when the same player signs in again", async () => {
    const store = new MemoryStore();
    const first = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    await store.adjustChips(first.id, -4000);
    const again = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada Renamed",
      avatar: null,
      accentColor: null,
    });
    expect(again.chips).toBe(STARTING_CHIPS - 4000);
    expect(again.name).toBe("Ada Renamed");
  });

  it("refuses to overdraw rather than going negative", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(await store.adjustChips(person.id, -(STARTING_CHIPS + 1))).toBe(false);
    expect((await store.get(person.id))?.chips).toBe(STARTING_CHIPS);
  });

  it("keeps a best turn as a high-water mark, not a total", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    await store.bumpStats(person.id, { bestTurn: 800 });
    await store.bumpStats(person.id, { bestTurn: 400 });
    expect((await store.get(person.id))?.stats.bestTurn).toBe(800);
  });
});

describe("playing for chips", () => {
  /** Everyone signs in; the fake identity is per-socket so seats differ. */
  async function startTable(options: {
    identities: Record<string, string | null>;
    roll?: () => Die[];
  }): Promise<{ store: MemoryStore; port: number }> {
    const store = new MemoryStore();
    let seen = 0;
    const order = Object.values(options.identities);
    server = createGreedServer({
      store,
      auth: null,
      serveClient: false,
      botDelayMs: 5,
      farklePauseMs: 20,
      roll: options.roll,
      // Hand out identities in connection order.
      identify: () => {
        const id = order[seen] ?? null;
        seen += 1;
        return id;
      },
    });
    await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
    return { store, port: (server.http.address() as AddressInfo).port };
  }

  function client(port: number): Promise<Client> {
    return new Promise((resolve) => {
      const socket: Client = connect(`http://localhost:${port}`, {
        transports: ["websocket"],
        forceNew: true,
      });
      open.push(socket);
      socket.on("room:state", (state) => {
        socket.latest = state;
      });
      socket.on("connect", () => resolve(socket));
    });
  }

  function stateWhere(socket: Client, ok: (state: RoomView) => boolean, ms = 2500) {
    if (socket.latest !== undefined && ok(socket.latest)) {
      return Promise.resolve(socket.latest);
    }
    return new Promise<RoomView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no matching state")), ms);
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

  function create(socket: Client, name: string): Promise<Ack> {
    return new Promise((resolve) => socket.emit("lobby:create", { name }, resolve));
  }

  function nextError(socket: Client): Promise<string> {
    return new Promise((resolve) => socket.once("room:error", resolve));
  }

  it("refuses a stake at a table with a guest in it", async () => {
    const { store, port } = await startTable({ identities: { a: null } });
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    expect(person.chips).toBe(STARTING_CHIPS);

    const host = await client(port);
    await create(host, "Ada"); // identified as a guest
    const complaint = nextError(host);
    host.emit("lobby:setBuyIn", { amount: 500 });
    expect(await complaint).toMatch(/signed in/i);
  });

  it("refuses a bot at a table playing for chips", async () => {
    const store = new MemoryStore();
    const person = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    const { port } = await startTable({ identities: { a: person.id } });

    const host = await client(port);
    await create(host, "Ada");
    host.emit("lobby:setBuyIn", { amount: 500 });
    await stateWhere(host, (view) => view.buyIn === 500);

    const complaint = nextError(host);
    host.emit("lobby:addBot", { skill: "normal" });
    expect(await complaint).toMatch(/free/i);
  });

  it("takes the stake at the deal and pays the pot to the winner", async () => {
    const store = new MemoryStore();
    const ada = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    // Six 1s every roll: 8,000 in one turn, so Ada wins at once.
    server = createGreedServer({
      store,
      auth: null,
      serveClient: false,
      farklePauseMs: 20,
      roll: () => [1, 1, 1, 1, 1, 1] as Die[],
      identify: () => ada.id,
    });
    await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
    const port = (server.http.address() as AddressInfo).port;

    const host = await client(port);
    await create(host, "Ada");
    host.emit("lobby:setBuyIn", { amount: 500 });
    await stateWhere(host, (view) => view.buyIn === 500);
    host.emit("lobby:setRules", { targetScore: 2000 });
    await stateWhere(host, (view) => view.ruleset.targetScore === 2000);

    host.emit("game:start");
    await stateWhere(host, (view) => view.status === "playing");
    // The stake is gone the moment the game is dealt.
    expect((await store.get(ada.id))?.chips).toBe(STARTING_CHIPS - 500);

    host.emit("game:roll");
    await stateWhere(host, (view) => (view.turn?.dice.length ?? 0) === 6);
    for (let index = 0; index < 6; index += 1) {
      host.emit("game:toggle", { index });
    }
    await stateWhere(host, (view) => (view.turn?.selection ?? 0) > 0);
    host.emit("game:bank");
    await stateWhere(host, (view) => view.status === "over");

    // Solo table, so the pot is their own stake coming back.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await store.get(ada.id))?.chips).toBe(STARTING_CHIPS);
    const games = await store.recentGames(ada.id, 5);
    expect(games).toHaveLength(1);
    expect(games[0]?.buyIn).toBe(500);
  });

  it("will not deal when a player cannot cover the stake", async () => {
    const store = new MemoryStore();
    const ada = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    await store.adjustChips(ada.id, -(STARTING_CHIPS - 10));
    server = createGreedServer({
      store,
      auth: null,
      serveClient: false,
      identify: () => ada.id,
    });
    await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
    const port = (server.http.address() as AddressInfo).port;

    const host = await client(port);
    await create(host, "Ada");
    host.emit("lobby:setBuyIn", { amount: 500 });
    await stateWhere(host, (view) => view.buyIn === 500);

    const complaint = nextError(host);
    host.emit("game:start");
    expect(await complaint).toMatch(/cannot cover/i);
    // And the balance is untouched, not partly taken.
    expect((await store.get(ada.id))?.chips).toBe(10);
  });
});

describe("who a seat belongs to", () => {
  /** A table where the only connection is signed in as `profileName`. */
  async function tableAs(profileName: string | null) {
    const store = new MemoryStore();
    let userId: string | null = null;
    if (profileName !== null) {
      const person = await store.upsertDiscordUser({
        discordId: "d1",
        name: profileName,
        avatar: null,
        accentColor: null,
      });
      userId = person.id;
    }
    server = createGreedServer({
      store,
      auth: null,
      serveClient: false,
      identify: () => userId,
    });
    await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
    return (server.http.address() as AddressInfo).port;
  }

  function client(port: number): Promise<Client> {
    return new Promise((resolve) => {
      const socket: Client = connect(`http://localhost:${port}`, {
        transports: ["websocket"],
        forceNew: true,
      });
      open.push(socket);
      socket.on("room:state", (state) => {
        socket.latest = state;
      });
      socket.on("connect", () => resolve(socket));
    });
  }

  function stateWhere(socket: Client, ok: (state: RoomView) => boolean, ms = 2500) {
    if (socket.latest !== undefined && ok(socket.latest)) {
      return Promise.resolve(socket.latest);
    }
    return new Promise<RoomView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no matching state")), ms);
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

  it("seats a signed-in player under their profile name, not one they sent", async () => {
    const port = await tableAs("Ada");
    const host = await client(port);
    // The client claims to be someone else entirely.
    await new Promise((resolve) => host.emit("lobby:create", { name: "Not Ada" }, resolve));
    const view = await stateWhere(host, (state) => state.seats.length === 1);
    expect(view.seats[0]?.name).toBe("Ada");
  });

  it("does the same when joining an existing table", async () => {
    const port = await tableAs("Ada");
    const host = await client(port);
    const created = await new Promise<Ack>((resolve) =>
      host.emit("lobby:create", { name: "Ada" }, resolve),
    );
    const code = created.ok ? created.code : "";

    const other = await client(port);
    await new Promise((resolve) => other.emit("lobby:join", { name: "Impostor", code }, resolve));
    const view = await stateWhere(other, (state) => state.seats.length === 2);
    expect(view.seats.map((seat) => seat.name)).toEqual(["Ada", "Ada"]);
  });

  it("lets a guest keep the name they typed", async () => {
    const port = await tableAs(null);
    const host = await client(port);
    await new Promise((resolve) => host.emit("lobby:create", { name: "Whoever" }, resolve));
    const view = await stateWhere(host, (state) => state.seats.length === 1);
    expect(view.seats[0]?.name).toBe("Whoever");
  });
});
