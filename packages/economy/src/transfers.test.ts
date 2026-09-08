import { describe, expect, it } from "vitest";
import { MemoryStore, STARTING_CHIPS } from "./store.js";
import { DAILY_SEND_CAP, MIN_SEND, judgeSend, leftToSend } from "./transfers.js";

/**
 * Chips moving between two people.
 *
 * The rule worth pinning above all others is that a transfer conserves: what
 * one account loses the other gains, and the total across the building does
 * not move. This is the first thing here that shifts chips with no game
 * played, so it is the first thing that could quietly mint them.
 */

describe("judgeSend", () => {
  const ok = { amount: 100, balance: 1000, sentToday: 0 };

  it("allows an ordinary transfer", () => {
    expect(judgeSend(ok)).toEqual({ ok: true });
  });

  it("refuses an amount that is not a whole number of chips", () => {
    for (const amount of [0, -50, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(judgeSend({ ...ok, amount })).toEqual({ ok: false, reason: "bad-amount" });
    }
  });

  it("allows the smallest transfer there is", () => {
    expect(judgeSend({ ...ok, amount: MIN_SEND })).toEqual({ ok: true });
  });

  it("refuses more than the sender holds", () => {
    expect(judgeSend({ ...ok, amount: 1001, balance: 1000 })).toEqual({
      ok: false,
      reason: "not-enough",
    });
  });

  it("allows exactly what the sender holds", () => {
    expect(judgeSend({ ...ok, amount: 1000, balance: 1000 })).toEqual({ ok: true });
  });

  it("refuses more than is left of today's allowance", () => {
    expect(
      judgeSend({ amount: 2, balance: 999_999, sentToday: DAILY_SEND_CAP - 1 }),
    ).toEqual({ ok: false, reason: "over-cap" });
  });

  it("allows exactly what is left of it", () => {
    expect(
      judgeSend({ amount: 1, balance: 999_999, sentToday: DAILY_SEND_CAP - 1 }),
    ).toEqual({ ok: true });
  });

  /*
   * Both refusals are true of somebody sending more than they have and more
   * than they may. The one they can do something about is the one to say.
   */
  it("says 'not enough' before 'over the cap' when both are true", () => {
    expect(judgeSend({ amount: 999_999, balance: 10, sentToday: DAILY_SEND_CAP })).toEqual({
      ok: false,
      reason: "not-enough",
    });
  });
});

describe("leftToSend", () => {
  it("is the whole cap for somebody who has sent nothing", () => {
    expect(leftToSend(0)).toBe(DAILY_SEND_CAP);
  });

  it("never goes below nothing, however much has gone out", () => {
    expect(leftToSend(DAILY_SEND_CAP * 3)).toBe(0);
  });
});

describe("sending, through the store", () => {
  async function two() {
    const store = new MemoryStore();
    const ada = await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada",
      avatar: null,
      accentColor: null,
    });
    const bo = await store.upsertDiscordUser({
      discordId: "d2",
      name: "Bo",
      avatar: null,
      accentColor: null,
    });
    return { store, ada, bo };
  }

  const chips = async (store: MemoryStore, id: string) => (await store.get(id))?.chips ?? -1;

  it("moves the chips and says what is left", async () => {
    const { store, ada, bo } = await two();

    const sent = await store.send(ada.id, bo.id, 500);

    expect(sent).toMatchObject({ ok: true, amount: 500, balance: STARTING_CHIPS - 500 });
    expect(await chips(store, ada.id)).toBe(STARTING_CHIPS - 500);
    expect(await chips(store, bo.id)).toBe(STARTING_CHIPS + 500);
  });

  /* The property the whole thing rests on. Nothing here may mint. */
  it("conserves: the pair holds exactly what it held before", async () => {
    const { store, ada, bo } = await two();
    const before = (await chips(store, ada.id)) + (await chips(store, bo.id));

    await store.send(ada.id, bo.id, 500);
    await store.send(bo.id, ada.id, 120);
    await store.send(ada.id, bo.id, 3);

    expect((await chips(store, ada.id)) + (await chips(store, bo.id))).toBe(before);
  });

  it("refuses to send to yourself, and moves nothing", async () => {
    const { store, ada } = await two();

    expect(await store.send(ada.id, ada.id, 100)).toMatchObject({
      ok: false,
      reason: "to-yourself",
    });
    expect(await chips(store, ada.id)).toBe(STARTING_CHIPS);
  });

  it("refuses a recipient who does not exist, and moves nothing", async () => {
    const { store, ada } = await two();

    expect(await store.send(ada.id, "nobody", 100)).toMatchObject({
      ok: false,
      reason: "no-recipient",
    });
    expect(await chips(store, ada.id)).toBe(STARTING_CHIPS);
  });

  it("refuses more than the sender holds, and moves nothing", async () => {
    const { store, ada, bo } = await two();

    expect(await store.send(ada.id, bo.id, STARTING_CHIPS + 1)).toMatchObject({
      ok: false,
      reason: "not-enough",
    });
    expect(await chips(store, ada.id)).toBe(STARTING_CHIPS);
    expect(await chips(store, bo.id)).toBe(STARTING_CHIPS);
  });

  it("counts what has gone out against the cap", async () => {
    const { store, ada, bo } = await two();
    await store.adjustChips(ada.id, DAILY_SEND_CAP);

    await store.send(ada.id, bo.id, 1000);

    expect(await store.sentSince(ada.id, 0)).toBe(1000);
    const again = await store.send(ada.id, bo.id, 1);
    expect(again.ok && again.leftToday).toBe(DAILY_SEND_CAP - 1001);
  });

  it("refuses once the day's allowance is spent", async () => {
    const { store, ada, bo } = await two();
    await store.adjustChips(ada.id, DAILY_SEND_CAP * 2);

    await store.send(ada.id, bo.id, DAILY_SEND_CAP);
    const over = await store.send(ada.id, bo.id, 1);

    expect(over).toMatchObject({ ok: false, reason: "over-cap", leftToday: 0 });
  });

  /* Receiving is not sending: being paid does not spend your own allowance. */
  it("does not count what came in against the recipient's allowance", async () => {
    const { store, ada, bo } = await two();

    await store.send(ada.id, bo.id, 900);

    expect(await store.sentSince(bo.id, 0)).toBe(0);
  });

  it("writes every transfer down, for both ends of it", async () => {
    const { store, ada, bo } = await two();

    await store.send(ada.id, bo.id, 700);

    for (const who of [ada.id, bo.id]) {
      const [entry] = await store.transfers(who, 10);
      expect(entry).toMatchObject({
        fromId: ada.id,
        fromName: "Ada",
        toId: bo.id,
        toName: "Bo",
        amount: 700,
      });
    }
  });

  it("records nothing for a transfer that was refused", async () => {
    const { store, ada, bo } = await two();

    await store.send(ada.id, bo.id, STARTING_CHIPS + 1);

    expect(await store.transfers(ada.id, 10)).toEqual([]);
  });

  it("keeps the names as they were, not as they became", async () => {
    const { store, ada, bo } = await two();
    await store.send(ada.id, bo.id, 100);

    await store.upsertDiscordUser({
      discordId: "d1",
      name: "Ada Renamed",
      avatar: null,
      accentColor: null,
    });

    const [entry] = await store.transfers(bo.id, 10);
    expect(entry?.fromName).toBe("Ada");
  });
});

describe("finding somebody to pay", () => {
  async function people(names: string[]) {
    const store = new MemoryStore();
    for (const [index, name] of names.entries()) {
      await store.upsertDiscordUser({
        discordId: `d${index}`,
        name,
        avatar: null,
        accentColor: null,
      });
    }
    return store;
  }

  it("matches on the start of a name, whatever the case", async () => {
    const store = await people(["Ada", "Adam", "Bo"]);

    expect((await store.findPlayers("ad", 10)).map((one) => one.name).sort()).toEqual([
      "Ada",
      "Adam",
    ]);
  });

  it("does not match the middle of a name", async () => {
    const store = await people(["Ada", "Bo"]);
    expect(await store.findPlayers("da", 10)).toEqual([]);
  });

  it("answers nothing at all to an empty search", async () => {
    const store = await people(["Ada", "Bo"]);
    expect(await store.findPlayers("   ", 10)).toEqual([]);
  });

  it("hands back no more than it was asked for", async () => {
    const store = await people(["Ada", "Adam", "Adele", "Adrian"]);
    expect(await store.findPlayers("ad", 2)).toHaveLength(2);
  });

  /*
   * What a match does not carry matters more than what it does. This is the
   * one route in the building that answers questions about people who are not
   * asking, so it says who somebody is and nothing about what they have.
   */
  it("never says what anybody holds", async () => {
    const store = await people(["Ada"]);

    const [found] = await store.findPlayers("ada", 10);

    expect(Object.keys(found ?? {}).sort()).toEqual(["accentColor", "avatar", "id", "name"]);
  });
});
