import type { AddressInfo } from "node:net";
import { MemoryStore } from "@backroom/economy";
import type { ClientToServer, ServerToClient, SpinResult } from "@backroom/shared";
import type { Socket } from "socket.io-client";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BackRoomServer } from "./server.js";
import { createBackRoomServer } from "./server.js";

/**
 * The machine, tested where the money actually moves.
 *
 * The arithmetic is proven in games/slots and needs no server. What is only
 * reachable here is whether this end wires it up the right way round: that a
 * stake goes into the bank before the reels are drawn, that a win comes out of
 * the bank rather than from nowhere, and that the two always cancel.
 *
 * That last one is the whole reason this game is allowed to exist, so it is
 * asserted on every spin of a long run rather than at the end of one.
 */

type Client = Socket<ServerToClient, ClientToServer>;

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
  delete process.env["ADMIN_DISCORD_IDS"];
});

beforeEach(() => {
  delete process.env["ADMIN_DISCORD_IDS"];
});

interface Machine {
  base: string;
  store: MemoryStore;
  userId: string;
  client: Client;
}

/**
 * A machine with a known bank and a known player at it.
 *
 * `as` is who the server thinks is asking, on the socket and over HTTP alike,
 * which is how a test says "nobody is signed in" without standing up a real
 * sign-in.
 */
async function openMachine(
  options: {
    bank?: number;
    chips?: number;
    signedIn?: boolean;
    discordId?: string;
    spinRandom?: () => number;
  } = {},
): Promise<Machine> {
  const store = new MemoryStore();
  const player = await store.upsertDiscordUser({
    discordId: options.discordId ?? "d1",
    name: "Ada",
    avatar: null,
    accentColor: null,
  });
  if (options.chips !== undefined) {
    const current = (await store.get(player.id))?.chips ?? 0;
    await store.adjustChips(player.id, options.chips - current);
  }
  if (options.bank !== undefined && options.bank > 0) {
    await store.bankAdd(options.bank);
  }

  const as = options.signedIn === false ? null : player.id;
  server = createBackRoomServer({
    store,
    auth: null,
    serveClient: false,
    identify: () => as,
    identifyRequest: () => as,
    ...(options.spinRandom === undefined ? {} : { spinRandom: options.spinRandom }),
  });
  await new Promise<void>((resolve) => server?.http.listen(0, () => resolve()));
  const port = (server.http.address() as AddressInfo).port;

  const client: Client = connect(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  open.push(client);
  await new Promise<void>((resolve) => client.on("connect", () => resolve()));

  return { base: `http://localhost:${port}`, store, userId: player.id, client };
}

function spin(client: Client, stake: number): Promise<SpinResult> {
  return new Promise((resolve) => client.emit("slots:spin", { stake }, resolve));
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("a spin", () => {
  it("takes the stake and settles inside what the paytable can owe", async () => {
    const { client, store, userId } = await openMachine({ bank: 50_000 });
    const before = (await store.get(userId))?.chips ?? 0;

    const result = await spin(client, 10);

    expect(result.ok).toBe(true);
    const after = (await store.get(userId))?.chips ?? 0;
    // Whatever the reels did: ten chips left, and anything won came back.
    expect(after).toBeGreaterThanOrEqual(before - 10);
    expect(after).toBeLessThanOrEqual(before - 10 + 875 * 10);
  });

  it("mints nothing, ever", async () => {
    /*
     * The invariant, and the reason a machine is allowed in a building where
     * chips only come from real people. Every chip the player gained came out
     * of the bank; every chip the bank gained came off the player. The two
     * deltas must cancel exactly — not on average, and not by the end of the
     * run, but on every single spin.
     */
    const { client, store, userId } = await openMachine({ bank: 500_000, chips: 100_000 });
    for (let n = 0; n < 200; n += 1) {
      const chipsBefore = (await store.get(userId))?.chips ?? 0;
      const bankBefore = await store.bank();

      await spin(client, 5);

      const chipsAfter = (await store.get(userId))?.chips ?? 0;
      const bankAfter = await store.bank();
      expect(chipsAfter - chipsBefore + (bankAfter - bankBefore)).toBe(0);
    }
  });

  it("never lets the bank go negative", async () => {
    const { client, store } = await openMachine({ bank: 500_000, chips: 100_000 });
    for (let n = 0; n < 200; n += 1) {
      await spin(client, 5);
      expect(await store.bank()).toBeGreaterThanOrEqual(0);
    }
  });

  it("says what it paid, and pays exactly that", async () => {
    const { client, store, userId } = await openMachine({ bank: 500_000, chips: 100_000 });
    for (let n = 0; n < 50; n += 1) {
      const before = (await store.get(userId))?.chips ?? 0;
      const result = await spin(client, 5);
      const after = (await store.get(userId))?.chips ?? 0;
      if (result.ok) {
        // The number on the glass is the number in the account.
        expect(after - before).toBe(result.won - 5);
        expect(result.balance).toBe(after);
        expect(result.bank).toBe(await store.bank());
      }
    }
  });

  it("refuses a stake above what the bank can cover", async () => {
    // maxStake(50_000) is 38.
    const { client } = await openMachine({ bank: 50_000 });
    const result = await spin(client, 39);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/bank/i);
  });

  it("puts nothing on the felt when it refuses", async () => {
    const { client, store, userId } = await openMachine({ bank: 50_000 });
    const before = (await store.get(userId))?.chips ?? 0;
    const bank = await store.bank();

    await spin(client, 39);

    expect((await store.get(userId))?.chips).toBe(before);
    expect(await store.bank()).toBe(bank);
  });

  it("refuses a stake the player cannot cover", async () => {
    const { client, store } = await openMachine({ bank: 5_000_000, chips: 3 });
    const bank = await store.bank();
    const result = await spin(client, 10);
    expect(result.ok).toBe(false);
    // And the bank did not quietly keep a stake that was never paid.
    expect(await store.bank()).toBe(bank);
  });

  it("refuses a stake that is not a positive whole number", async () => {
    const { client } = await openMachine({ bank: 500_000 });
    for (const stake of [0, -5, 1.5, Number.NaN]) {
      expect((await spin(client, stake)).ok).toBe(false);
    }
  });

  it("will not spin at all on an empty bank", async () => {
    // maxStake(0) is 0, so there is no stake the machine can offer.
    const { client } = await openMachine({ bank: 0 });
    const result = await spin(client, 1);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/empty/i);
  });

  it("refuses somebody who is not signed in", async () => {
    const { client } = await openMachine({ bank: 500_000, signedIn: false });
    const result = await spin(client, 5);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/sign in/i);
  });

  it("sends back a grid the client can actually draw", async () => {
    const { client } = await openMachine({ bank: 500_000 });
    const result = await spin(client, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.grid).toHaveLength(5);
    for (const column of result.grid) {
      expect(column).toHaveLength(3);
      for (const face of column) {
        expect(typeof face).toBe("string");
        expect(face.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps a count of what the player has done at it", async () => {
    const { client, store, userId } = await openMachine({ bank: 500_000, chips: 100_000 });
    await spin(client, 5);
    await spin(client, 5);
    const profile = await store.get(userId);
    expect(profile?.byGame["slots"]?.["spins"]).toBe(2);
    expect(profile?.byGame["slots"]?.["staked"]).toBe(10);
  });
});

describe("stocking the bank", () => {
  it("lets an admin float it", async () => {
    process.env["ADMIN_DISCORD_IDS"] = "d-admin";
    const { base, store } = await openMachine({ bank: 0, discordId: "d-admin" });

    const response = await post(`${base}/api/admin/bank`, { amount: 50_000 });

    expect(response.status).toBe(200);
    expect(response.body["bank"]).toBe(50_000);
    // 50,000 / 1296, which is what the machine may then offer.
    expect(response.body["maxStake"]).toBe(38);
    expect(await store.bank()).toBe(50_000);
  });

  it("refuses anybody who is not an admin", async () => {
    /*
     * This is the only way chips enter the bank from outside play, which makes
     * it one of the ways to make chips exist. It is guarded exactly as minting
     * a redemption code is, and for the same reason.
     */
    process.env["ADMIN_DISCORD_IDS"] = "d-somebody-else";
    const { base, store } = await openMachine({ bank: 0, discordId: "d1" });

    const response = await post(`${base}/api/admin/bank`, { amount: 50_000 });

    // 404 rather than 403, in step with every other admin route: whether this
    // endpoint exists is not something an unauthorised visitor needs to learn.
    expect(response.status).toBe(404);
    expect(await store.bank()).toBe(0);
  });

  it("refuses everybody when the admin list is unset", async () => {
    // admin.ts fails closed, and so does this.
    const { base, store } = await openMachine({ bank: 0, discordId: "d-admin" });
    expect((await post(`${base}/api/admin/bank`, { amount: 500 })).status).toBe(404);
    expect(await store.bank()).toBe(0);
  });

  it("refuses an amount that is not a positive whole number", async () => {
    process.env["ADMIN_DISCORD_IDS"] = "d-admin";
    const { base, store } = await openMachine({ bank: 0, discordId: "d-admin" });
    for (const amount of [0, -1, 2.5, "lots", null]) {
      expect((await post(`${base}/api/admin/bank`, { amount })).status).toBe(400);
    }
    expect(await store.bank()).toBe(0);
  });

  it("reports what the bank holds and what it can therefore offer", async () => {
    process.env["ADMIN_DISCORD_IDS"] = "d-admin";
    const { base } = await openMachine({ bank: 1_000_000, discordId: "d-admin" });
    const response = await fetch(`${base}/api/admin/bank`);
    expect(await response.json()).toEqual({ bank: 1_000_000, maxStake: 771 });
  });
});

describe("where the reels come from", () => {
  it("does not take its randomness from Math.random", async () => {
    /*
     * V8 implements Math.random as xorshift128+, and this machine hands the
     * player the whole grid after every spin — which is exactly the run of
     * observations needed to recover that generator's state and predict what
     * is coming. With the jackpot at 40% of the bank and the stake cap rising
     * alongside it, knowing when it lands is worth real money.
     *
     * Pinning Math.random to a constant would freeze every reel if the machine
     * were using it. The grids have to keep moving.
     */
    const real = Math.random;
    Math.random = () => 0.5;
    try {
      const { client } = await openMachine({ bank: 500_000, chips: 100_000 });
      const grids = new Set<string>();
      for (let n = 0; n < 12; n += 1) {
        const result = await spin(client, 1);
        if (result.ok) {
          grids.add(JSON.stringify(result.grid));
        }
      }
      expect(grids.size).toBeGreaterThan(1);
    } finally {
      Math.random = real;
    }
  });
});

describe("the jackpot", () => {
  /*
   * Stops 29, 30 and 31 of the strip are the three sevens, so a reel that
   * lands on 29 shows nothing else. Every reel landing there fills the grid
   * with sevens and lights all nine paylines at once — one spin in 10^15,
   * and the only arrangement that could make this machine mint chips.
   */
  const allSevens = () => 29 / 32;

  it("pays a share of the bank the stake has just gone into", async () => {
    const { client, store, userId } = await openMachine({
      bank: 500_000,
      chips: 100_000,
      spinRandom: allSevens,
    });
    const chipsBefore = (await store.get(userId))?.chips ?? 0;

    const result = await spin(client, 10);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.jackpot).toBe(true);
    // 40% of 500,010 — the bank with the stake already in it.
    expect(result.won).toBe(200_004);
    expect((await store.get(userId))?.chips).toBe(chipsBefore - 10 + 200_004);
    expect(await store.bank()).toBe(500_000 + 10 - 200_004);
  });

  it("pays once, not once per line", async () => {
    /*
     * Nine lines all read five sevens here. Paid per line this would be 360%
     * of the bank, and the machine would owe chips that were never staked.
     */
    const { client, store } = await openMachine({
      bank: 500_000,
      chips: 100_000,
      spinRandom: allSevens,
    });
    const result = await spin(client, 10);
    expect(result.ok && result.won).toBe(200_004);
    expect(await store.bank()).toBeGreaterThan(0);
  });

  it("still leaves the bank solvent at the largest stake the cap allows", async () => {
    // The worst spin the machine can be asked for, actually played.
    const bank = 500_000;
    const { client, store } = await openMachine({
      bank,
      chips: 10_000_000,
      spinRandom: allSevens,
    });
    // floor(500000 / 1296) — the most this bank can certainly cover.
    const result = await spin(client, 385);
    expect(result.ok).toBe(true);
    expect(await store.bank()).toBeGreaterThanOrEqual(0);
  });
});

describe("the sign on the machine", () => {
  it("says what the bank holds without anybody signing in", async () => {
    // The bank is the whole appeal of this game; a sign only members can read
    // advertises nothing.
    const { base } = await openMachine({ bank: 250_000, signedIn: false });
    const body = await (await fetch(`${base}/api/slots`)).json();
    expect(body).toEqual({ bank: 250_000, maxStake: 192, jackpot: 100_000 });
  });

  it("says nothing about who is playing", async () => {
    const { base } = await openMachine({ bank: 250_000 });
    const body = (await (await fetch(`${base}/api/slots`)).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["bank", "jackpot", "maxStake"]);
  });
});

