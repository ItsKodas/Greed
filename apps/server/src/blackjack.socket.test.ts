import type { AddressInfo } from "node:net";
import { MemoryStore, STARTING_CHIPS } from "@backroom/economy";
import type { TableView } from "@backroom/game-blackjack";
import type { Ack, ClientToServer, ServerToClient } from "@backroom/shared";
import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createBackRoomServer } from "./server.js";
import type { BackRoomServer } from "./server.js";

/**
 * Blackjack, driven through the real socket layer.
 *
 * The engine is tested directly in its own package; what is only reachable
 * here is the seam the second game was built to prove — one `game:action`
 * event carrying verbs the server has never heard of, a view emitted per seat
 * because one card is face down, and chips moving as each stake is placed
 * rather than once at the end.
 *
 * The shoe is the server's own, so nothing here asserts which cards came out.
 * It asserts what must hold whatever they were: what the hand cost, what the
 * payload was allowed to contain, and that the chips agree with the outcome
 * the table announced.
 */

type Client = Socket<ServerToClient, ClientToServer> & { latest?: TableView };

let server: BackRoomServer | null = null;
const open: Client[] = [];

afterEach(async () => {
  for (const socket of open.splice(0)) {
    socket.close();
  }
  if (server !== null) {
    await server.close();
    server = null;
  }
});

/**
 * A room with real accounts in it.
 *
 * Each name becomes a profile with a starting balance; null is a guest. The
 * ids are handed to sockets in connection order, which is the only way to say
 * who somebody is without standing up a Discord round-trip.
 */
async function startRoom(...people: Array<string | null>): Promise<{
  store: MemoryStore;
  port: number;
  ids: Array<string | null>;
}> {
  const store = new MemoryStore();
  const ids: Array<string | null> = [];
  for (const [index, name] of people.entries()) {
    if (name === null) {
      ids.push(null);
      continue;
    }
    const profile = await store.upsertDiscordUser({
      discordId: `d${index}`,
      name,
      avatar: null,
      accentColor: null,
    });
    ids.push(profile.id);
  }

  let seen = 0;
  server = createBackRoomServer({
    store,
    auth: null,
    serveClient: false,
    identify: () => {
      const id = ids[seen] ?? null;
      seen += 1;
      return id;
    },
  });
  await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
  return { store, port: (server.http.address() as AddressInfo).port, ids };
}

function client(port: number): Promise<Client> {
  return new Promise((resolve) => {
    const socket: Client = connect(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    socket.on("room:state", (state) => {
      socket.latest = state as unknown as TableView;
    });
    socket.on("connect", () => resolve(socket));
  });
}

function stateWhere(socket: Client, ok: (state: TableView) => boolean, ms = 2500) {
  if (socket.latest !== undefined && ok(socket.latest)) {
    return Promise.resolve(socket.latest);
  }
  return new Promise<TableView>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching state")), ms);
    const listener = (raw: unknown) => {
      const state = raw as TableView;
      if (ok(state)) {
        clearTimeout(timer);
        socket.off("room:state", listener);
        resolve(state);
      }
    };
    socket.on("room:state", listener);
  });
}

function open_(socket: Client, name: string): Promise<Ack> {
  return new Promise((resolve) =>
    socket.emit("lobby:create", { name, game: "blackjack" }, resolve),
  );
}

/** Sends a move and waits for the server to say it has dealt with it. */
function act(socket: Client, action: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) =>
    socket.emit("game:action", action as { type: string }, () => resolve()),
  );
}

/**
 * Bets and deals until a hand arrives that still has a decision in it.
 *
 * A natural blackjack is over inside `deal` — the seat is done, the dealer
 * plays, and the table settles before the first broadcast — so a hand that
 * reaches the playing phase is only about nineteen times in twenty. The shoe
 * is the server's own and cannot be seeded from out here, so this deals again
 * rather than asserting on a hand that may not exist.
 */
async function dealLive(socket: Client, stake = 500): Promise<TableView> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await act(socket, { type: "bet", amount: stake });
    await act(socket, { type: "deal" });
    const dealt = await stateWhere(socket, (view) => view.phase !== "betting");
    if (dealt.phase === "playing" && dealt.turnSeatId !== null) {
      return dealt;
    }
    await stateWhere(socket, (view) => view.phase === "settled");
    await act(socket, { type: "nextHand" });
    await stateWhere(socket, (view) => view.phase === "betting");
  }
  throw new Error("twelve hands running were over before they began");
}

describe("blackjack over the wire", () => {
  it("opens a table that says which game it is", async () => {
    const { port } = await startRoom("Ada");
    const host = await client(port);
    const ack = await open_(host, "Ada");

    expect(ack.ok).toBe(true);
    const state = await stateWhere(host, (view) => view.seats.length === 1);
    expect((state as unknown as { game: string }).game).toBe("blackjack");
    expect(state.phase).toBe("betting");
    expect(state.minBet).toBeGreaterThan(0);
  });

  it("turns a guest away, because there is no friendly blackjack", async () => {
    const { port } = await startRoom(null);
    const guest = await client(port);
    const ack = await open_(guest, "Nobody");

    expect(ack).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
  });

  it("takes the stake as it is placed and gives it back when it is withdrawn", async () => {
    const { store, port, ids } = await startRoom("Ada");
    const ada = ids[0] as string;
    const host = await client(port);
    await open_(host, "Ada");

    await act(host, { type: "bet", amount: 500 });
    await stateWhere(host, (view) => view.seats[0]?.bet === 500);
    expect((await store.get(ada))?.chips).toBe(STARTING_CHIPS - 500);

    await act(host, { type: "bet", amount: 0 });
    await stateWhere(host, (view) => view.seats[0]?.bet === 0);
    expect((await store.get(ada))?.chips).toBe(STARTING_CHIPS);
  });

  it("refuses a stake nobody can cover, and charges nothing for the refusal", async () => {
    const { store, port, ids } = await startRoom("Ada");
    const ada = ids[0] as string;
    await store.adjustChips(ada, -(STARTING_CHIPS - 100));
    const host = await client(port);
    await open_(host, "Ada");

    const refused = new Promise<string>((resolve) => host.once("room:error", resolve));
    await act(host, { type: "bet", amount: 1000 });

    expect(await refused).toMatch(/cannot cover/i);
    expect((await store.get(ada))?.chips).toBe(100);
    expect(host.latest?.seats[0]?.bet).toBe(0);
  });

  it("keeps the hole card off the wire until the dealer plays", async () => {
    const { port } = await startRoom("Ada");
    const host = await client(port);
    await open_(host, "Ada");

    const dealt = await dealLive(host);
    // Not "sent and hidden by the browser" — the second card is not in the
    // payload at all, which is the entire reason a view is built per seat.
    expect(dealt.dealer.cards).toHaveLength(1);
    expect(dealt.dealer.hidden).toBe(true);
    expect(dealt.seats[0]?.cards).toHaveLength(2);
    expect(dealt.turnSeatId).toBe(dealt.seats[0]?.id);
  });

  it("settles the hand and pays what the outcome says it pays", async () => {
    const { store, port, ids } = await startRoom("Ada");
    const ada = ids[0] as string;
    const host = await client(port);
    await open_(host, "Ada");

    await dealLive(host);
    // Both read after the deal, so whatever hands dealLive played out first
    // are already in them and this measures only the hand about to finish.
    const staked = (await store.get(ada))?.chips ?? 0;
    const played = (await store.get(ada))?.stats.games ?? 0;

    await act(host, { type: "stand" });
    const over = await stateWhere(host, (view) => view.phase === "settled");

    const seat = over.seats[0];
    expect(seat?.outcome).not.toBeNull();
    // The whole hand is now face up: nothing is being held back after it ends.
    expect(over.dealer.hidden).toBe(false);
    expect(over.dealer.cards.length).toBeGreaterThanOrEqual(2);

    // Settling is asynchronous, so wait for the chips rather than assume them.
    await expect
      .poll(async () => (await store.get(ada))?.chips)
      .toBe(staked + (seat?.returned ?? 0));

    const record = await store.get(ada);
    expect(record?.stats.games).toBe(played + 1);
  });

  it("deals another hand to everyone still sitting there", async () => {
    const { port } = await startRoom("Ada");
    const host = await client(port);
    await open_(host, "Ada");
    await dealLive(host);
    await act(host, { type: "stand" });
    await stateWhere(host, (view) => view.phase === "settled");

    await act(host, { type: "nextHand" });
    const again = await stateWhere(host, (view) => view.phase === "betting");
    expect(again.seats[0]?.bet).toBe(0);
    expect(again.seats[0]?.cards).toHaveLength(0);
    expect(again.dealer.cards).toHaveLength(0);
  });

  it("will not take a verb from another game", async () => {
    const { port } = await startRoom("Ada");
    const host = await client(port);
    await open_(host, "Ada");

    const refused = new Promise<string>((resolve) => host.once("room:error", resolve));
    await act(host, { type: "roll" });

    expect(await refused).toMatch(/not something you can do/i);
  });
});
