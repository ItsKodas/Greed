import type { AddressInfo } from "node:net";
import { MemoryStore, STARTING_CHIPS } from "@backroom/economy";
import type { TableView } from "@backroom/game-blackjack";
import type { Ack, ClientToServer, ServerToClient } from "@backroom/shared";
import type { Socket } from "socket.io-client";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type { BackRoomServer } from "./server.js";
import { createBackRoomServer } from "./server.js";

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

/*
 * Every state the socket has been sent, and how far a test has read.
 *
 * A continuous table passes through states faster than a test can ask about
 * them — a settled hand is on screen for a moment and then the felt is clear
 * again — so a test that only ever sees "the state right now" is a test that
 * fails whenever the machine is quick. States are kept as a stream instead,
 * and each wait picks up where the last one finished.
 */
type Client = Socket<ServerToClient, ClientToServer> & {
  latest?: TableView;
  seen: TableView[];
  read: number;
};

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
async function startRoom(
  people: Array<string | null>,
  /*
   * How fast the table comes round. Left alone by most of these, because a
   * table that deals itself every fraction of a second would race the very
   * actions they are trying to take; the one test that is about the loop
   * turns it right down.
   */
  timings: { bettingMs?: number; settleMs?: number; turnMs?: number; lastCallMs?: number } = {},
  // A long window for bets so the table does not deal underneath a test that
  // is still setting itself up, and almost no wait between rounds so one that
  // needs several hands is not sitting through six seconds of each.
  { bettingMs = 30_000, settleMs = 80 } = timings,
): Promise<{
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
    // Bots think for a moment in a real room; here that moment is nothing.
    botDelayMs: 5,
    bettingMs,
    settleMs,
    ...(timings.turnMs === undefined ? {} : { turnMs: timings.turnMs }),
    ...(timings.lastCallMs === undefined ? {} : { lastCallMs: timings.lastCallMs }),
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
    socket.seen = [];
    socket.read = 0;
    open.push(socket);
    socket.on("room:state", (state) => {
      socket.latest = state as unknown as TableView;
      socket.seen.push(socket.latest);
    });
    socket.on("connect", () => resolve(socket));
  });
}

/**
 * The next state that matches, counting from wherever the last wait stopped.
 *
 * Reading forward through the stream rather than looking at the latest state
 * is what makes these tests independent of how fast the table is: a hand that
 * settled and cleared while the test was between two awaits is still there to
 * be found. It also keeps them honest — a wait cannot be satisfied by a state
 * from a hand two deals ago, because that has already been read past.
 */
function stateWhere(socket: Client, ok: (state: TableView) => boolean, ms = 2500) {
  for (let index = socket.read; index < socket.seen.length; index += 1) {
    const state = socket.seen[index] as TableView;
    if (ok(state)) {
      socket.read = index + 1;
      return Promise.resolve(state);
    }
  }
  socket.read = socket.seen.length;

  return new Promise<TableView>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            // What the stream actually held, because "no matching state" on
            // its own says nothing about which wait gave up or why.
            `no matching state: read ${socket.read} of ${socket.seen.length}, seen [${socket.seen
              .map((view) => view.phase)
              .join(" ")}]`,
          ),
        ),
      ms,
    );
    const listener = (raw: unknown) => {
      const state = raw as TableView;
      if (ok(state)) {
        clearTimeout(timer);
        socket.off("room:state", listener);
        socket.read = socket.seen.length;
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
    // That hand is already over — `dealt` is the settled state itself, and
    // waiting for another would be waiting for a hand nobody is going to
    // deal. Nothing to ask for either: the felt clears itself and opens again
    // on the table's own clock, which the harness turns right down.
    await stateWhere(socket, (view) => view.phase === "betting");
  }
  throw new Error("twelve hands running were over before they began");
}

describe("blackjack over the wire", () => {
  it("opens a table that says which game it is", async () => {
    const { port } = await startRoom(["Ada"]);
    const host = await client(port);
    const ack = await open_(host, "Ada");

    expect(ack.ok).toBe(true);
    const state = await stateWhere(host, (view) => view.seats.length === 1);
    expect((state as unknown as { game: string }).game).toBe("blackjack");
    expect(state.phase).toBe("betting");
    expect(state.minBet).toBeGreaterThan(0);
  });

  it("turns a guest away, because there is no friendly blackjack", async () => {
    const { port } = await startRoom([null]);
    const guest = await client(port);
    const ack = await open_(guest, "Nobody");

    expect(ack).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
  });

  it("takes the stake as it is placed and gives it back when it is withdrawn", async () => {
    const { store, port, ids } = await startRoom(["Ada"]);
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
    const { store, port, ids } = await startRoom(["Ada"]);
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
    const { port } = await startRoom(["Ada"]);
    const host = await client(port);
    await open_(host, "Ada");

    const dealt = await dealLive(host);
    // Not "sent and hidden by the browser" — the second card is not in the
    // payload at all, which is the entire reason a view is built per seat.
    expect(dealt.dealer.cards).toHaveLength(1);
    expect(dealt.dealer.hidden).toBe(true);
    expect(dealt.seats[0]?.hands[0]?.cards).toHaveLength(2);
    expect(dealt.turnSeatId).toBe(dealt.seats[0]?.id);
  });

  it("settles the hand and pays what the outcome says it pays", async () => {
    const { store, port, ids } = await startRoom(["Ada"]);
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
    // Across every hand, since a deal can end as more than one of them.
    const back = (seat?.hands ?? []).reduce((total, hand) => total + hand.returned, 0);
    expect((seat?.hands ?? []).every((hand) => hand.outcome !== null)).toBe(true);
    // The whole hand is now face up: nothing is being held back after it ends.
    expect(over.dealer.hidden).toBe(false);
    expect(over.dealer.cards.length).toBeGreaterThanOrEqual(2);

    // Settling is asynchronous, so wait for the chips rather than assume them.
    await expect.poll(async () => (await store.get(ada))?.chips).toBe(staked + back);

    const record = await store.get(ada);
    expect(record?.stats.games).toBe(played + 1);
  });

  it("tells you what you are worth as the chips move, without being asked", async () => {
    /*
     * The figure in the corner of every page. It moves for reasons the browser
     * never asked about — a stake taken as it is placed, a hand paying out on
     * the table's clock — so the server says so rather than waiting to be
     * asked at the next page load.
     */
    const { port } = await startRoom(["Ada"]);
    const host = await client(port);
    const said: number[] = [];
    host.on("me:chips", (chips) => said.push(chips));
    await open_(host, "Ada");

    await act(host, { type: "bet", amount: 500 });
    await expect.poll(() => said).toEqual([STARTING_CHIPS - 500]);

    await act(host, { type: "bet", amount: 0 });
    // Not a fresh figure of its own: the balance is whatever it now is.
    await expect.poll(() => said.at(-1)).toBe(STARTING_CHIPS);
  });

  it("keeps one player's balance to themselves", async () => {
    const { port } = await startRoom(["Ada", "Bo"]);
    const host = await client(port);
    const other = await client(port);
    await open_(host, "Ada");
    const code = (await stateWhere(host, (view) => view.seats.length === 1)).code;
    const heard: number[] = [];
    other.on("me:chips", (chips) => heard.push(chips));
    await new Promise<void>((resolve) =>
      other.emit("lobby:join", { name: "Bo", code }, () => resolve()),
    );
    await stateWhere(other, (view) => view.seats.length === 2);

    await act(host, { type: "bet", amount: 500 });
    await stateWhere(other, (view) => (view.seats[0]?.bet ?? 0) === 500);

    // Somebody else's stake is somebody else's business.
    expect(heard).toEqual([]);
  });

  it("clears a hand that was dealt early without waiting out the betting window", async () => {
    /*
     * Two waits, one table. Dealing early ends the betting window and starts
     * the one that clears the felt, and the server used to keep the first
     * timer because a table that is waiting is a table that is waiting — so a
     * hand dealt three seconds into a thirty-second window sat there face up
     * for the remaining twenty-seven.
     */
    const { port } = await startRoom(["Ada"], { bettingMs: 30_000, settleMs: 120 });
    const host = await client(port);
    await open_(host, "Ada");

    await dealLive(host);
    await act(host, { type: "stand" });
    await stateWhere(host, (view) => view.phase === "settled", 3000);

    // Well inside the betting window that dealing interrupted.
    const next = await stateWhere(host, (view) => view.phase === "betting", 3000);
    expect(next.seats[0]?.bet).toBe(0);
  });

  it("comes round on its own, with nobody dealing it", async () => {
    /*
     * The whole point of a continuous table: no host presses anything. A
     * window opens for bets, closes itself, the hand is played, and the felt
     * is cleared for the next one — all on the table's clock.
     */
    // No last call at this table: five seconds of one would shut a window
    // that is only open for a fraction of one, and this test is about the
    // loop coming round rather than about what the felt takes.
    const { port } = await startRoom(["Ada"], { bettingMs: 150, settleMs: 120, lastCallMs: 0 });
    const host = await client(port);
    await open_(host, "Ada");
    await stateWhere(host, (view) => view.seats.length === 1);

    // A window that closes with nothing on the felt just opens another.
    const idle = await stateWhere(host, (view) => (view.deadline ?? 0) > 0, 3000);
    expect(idle.phase).toBe("betting");

    await act(host, { type: "bet", amount: 500 });
    // Nobody asked for this hand.
    const dealt = await stateWhere(host, (view) => view.phase !== "betting", 3000);
    expect(dealt.seats[0]?.hands[0]?.cards.length).toBeGreaterThanOrEqual(2);

    // A natural is already settled, and waiting for a second settled state
    // would be waiting for a hand nobody is going to deal.
    if (dealt.phase === "playing") {
      await act(host, { type: "stand" });
      await stateWhere(host, (view) => view.phase === "settled", 3000);
    }

    // And nobody asked for the next one either.
    const again = await stateWhere(host, (view) => view.phase === "betting", 3000);
    expect(again.seats[0]?.bet).toBe(0);
    expect(again.seats[0]?.hands[0]?.cards).toHaveLength(0);
    expect(again.dealer.cards).toHaveLength(0);
    expect(again.deadline).not.toBeNull();
  });

  it("plays a hand for somebody who has walked away", async () => {
    /*
     * A table that deals itself cannot wait forever on one person, and
     * everybody else at it is waiting on the same one. Standing rather than
     * folding: silence should cost a turn, not a stake.
     */
    const { port } = await startRoom(["Ada"], { bettingMs: 30_000, turnMs: 150 });
    const host = await client(port);
    await open_(host, "Ada");
    await dealLive(host);

    const over = await stateWhere(host, (view) => view.phase === "settled", 3000);
    expect(over.seats[0]?.hands.every((hand) => hand.done)).toBe(true);
  });

  it("seats a bot that bets, plays its own hand and costs nobody anything", async () => {
    const { store, port, ids } = await startRoom(["Ada"]);
    const ada = ids[0] as string;
    const host = await client(port);
    await open_(host, "Ada");

    host.emit("lobby:addBot", { skill: "hard" });
    // It stakes itself without being asked: a bot at a card table has to put
    // something on the felt before there is a hand for it to play.
    const betting = await stateWhere(
      host,
      (view) => view.seats.length === 2 && (view.seats[1]?.bet ?? 0) > 0,
    );
    expect(betting.seats[1]?.isBot).toBe(true);

    // Nothing was taken for it, because there is no account to take it from.
    expect((await store.get(ada))?.chips).toBe(STARTING_CHIPS);

    await act(host, { type: "bet", amount: 500 });
    await act(host, { type: "deal" });
    // The human stands at once, so everything after this is the bot playing
    // itself out — the seam where a bot that has stopped moving looks exactly
    // like a table that has frozen.
    const dealt = await stateWhere(host, (view) => view.phase !== "betting");
    if (dealt.phase === "playing" && dealt.turnSeatId === dealt.seats[0]?.id) {
      await act(host, { type: "stand" });
    }

    // Already settled when both hands were naturals, which happens often
    // enough at a table of two to be worth not waiting for a second time.
    const over =
      dealt.phase === "settled"
        ? dealt
        : await stateWhere(host, (view) => view.phase === "settled", 8000);
    // Every hand it played, because a hard bot may have split into two.
    const botHands = over.seats[1]?.hands ?? [];
    expect(botHands.length).toBeGreaterThanOrEqual(1);
    expect(botHands.every((hand) => hand.outcome !== null)).toBe(true);
    expect(botHands.every((hand) => hand.cards.length >= 2)).toBe(true);
    // A bot never bust while standing pat: it took its own decisions.
    expect(over.turnSeatId).toBeNull();
  });

  it("stops taking chips once last call has gone out", async () => {
    /*
     * A window that is last call from the moment it opens, which is the only
     * way to test the rule without a test that sits through twenty-five
     * seconds of a real one.
     */
    const { port } = await startRoom(["Ada"], { bettingMs: 30_000, lastCallMs: 30_000 });
    const host = await client(port);
    await open_(host, "Ada");
    await stateWhere(host, (view) => view.seats.length === 1);

    const told = host.seen.length;

    const refused = new Promise<string>((resolve) => host.once("room:error", resolve));
    await act(host, { type: "bet", amount: 500 });

    expect(await refused).toMatch(/last call/i);
    // Nothing on the felt, and nothing said about it: a refused bet is not an
    // event, so the table never told anybody anything happened.
    expect(host.seen).toHaveLength(told);
    expect(host.latest?.seats[0]?.bet).toBe(0);
  });

  it("will not take a verb from another game", async () => {
    const { port } = await startRoom(["Ada"]);
    const host = await client(port);
    await open_(host, "Ada");

    const refused = new Promise<string>((resolve) => host.once("room:error", resolve));
    await act(host, { type: "roll" });

    expect(await refused).toMatch(/not something you can do/i);
  });
});

describe("what a stake does when the hand is over", () => {
  it("does not put the same chips back on the felt for the next hand", async () => {
    /*
     * A table that deals itself must not also bet for you. Nobody pressed
     * anything between these two hands, so the second one should find the felt
     * empty — a stake that quietly repeats is chips leaving an account every
     * thirty seconds for a hand its owner never agreed to play.
     */
    const { port } = await startRoom(["Ada"], {
      bettingMs: 200,
      settleMs: 80,
      turnMs: 200,
      lastCallMs: 0,
    });
    const host = await client(port);
    await open_(host, "Ada");
    await stateWhere(host, (view) => view.seats.length === 1);

    await act(host, { type: "bet", amount: 500 });
    await stateWhere(host, (view) => view.phase !== "betting", 3000);
    await stateWhere(host, (view) => view.phase === "settled", 4000);

    // The window after that one: nobody has bet in it.
    const next = await stateWhere(host, (view) => view.phase === "betting", 4000);

    expect(next.seats[0]?.bet).toBe(0);
    expect(next.seats[0]?.hands[0]?.cards).toHaveLength(0);
  });
});
