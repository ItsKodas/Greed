import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  judgeCode,
  mintCodeText,
  normaliseCode,
} from "./codes.js";
import type { CodeRecord } from "./codes.js";
import { MemoryStore, STARTING_CHIPS } from "./store.js";

function code(overrides: Partial<CodeRecord> = {}): CodeRecord {
  return {
    code: "ABCD-EFGH-JK",
    chips: 5000,
    maxRedemptions: null,
    redemptions: 0,
    expiresAt: null,
    note: "",
    createdBy: "admin",
    createdAt: Date.now(),
    revoked: false,
    ...overrides,
  };
}

describe("writing a code down", () => {
  it("uses only letters that cannot be misread", () => {
    for (const letter of CODE_ALPHABET) {
      expect("O0I1LU").not.toContain(letter);
    }
  });

  it("is the agreed length once the dashes come off", () => {
    const text = mintCodeText((bytes) => randomBytes(bytes));
    expect(normaliseCode(text)).toHaveLength(CODE_LENGTH);
    expect(text).toContain("-");
  });

  it("does not repeat itself", () => {
    const minted = new Set(
      Array.from({ length: 500 }, () => mintCodeText((bytes) => randomBytes(bytes))),
    );
    expect(minted.size).toBe(500);
  });

  it("throws away the bytes that would bias the alphabet", () => {
    /*
     * Thirty letters do not divide 256, so taking a byte modulo the alphabet
     * would make its first sixteen letters likelier than the rest — the kind
     * of bias that makes guessing cheaper than the length suggests. Bytes at
     * or above 240 are dropped instead of folded, and this checks the dropping
     * exactly rather than sampling a distribution and hoping.
     */
    const feed = (bytes: number[]) => {
      let at = 0;
      return (count: number) =>
        Uint8Array.from({ length: count }, () => bytes[at++ % bytes.length] as number);
    };

    // Plain bytes map straight onto the alphabet, in order.
    const plain = normaliseCode(mintCodeText(feed([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])));
    expect(plain).toBe(CODE_ALPHABET.slice(0, 10));

    // The same, with unusable bytes shuffled in: the output must not change.
    const withRejects = normaliseCode(
      mintCodeText(feed([0, 250, 1, 255, 2, 240, 3, 4, 5, 6, 7, 8, 9])),
    );
    expect(withRejects).toBe(CODE_ALPHABET.slice(0, 10));
  });

  it("reads a code back however it was typed", () => {
    expect(normaliseCode("abcd-efgh-jk")).toBe("ABCDEFGHJK");
    expect(normaliseCode(" ABCD EFGH JK ")).toBe("ABCDEFGHJK");
  });
});

describe("whether a code may be used", () => {
  const now = Date.now();

  it("allows a fresh one", () => {
    expect(judgeCode(code(), now)).toBeNull();
  });

  it("refuses one that was revoked, expired, or used up", () => {
    expect(judgeCode(code({ revoked: true }), now)).toBe("revoked");
    expect(judgeCode(code({ expiresAt: now - 1 }), now)).toBe("expired");
    expect(judgeCode(code({ maxRedemptions: 2, redemptions: 2 }), now)).toBe("used-up");
  });

  it("lets an unlimited code keep going", () => {
    expect(judgeCode(code({ maxRedemptions: null, redemptions: 9999 }), now)).toBeNull();
  });
});

describe("redeeming, in memory", () => {
  async function playerAt(store: MemoryStore, discordId: string) {
    return store.upsertDiscordUser({ discordId, name: discordId, avatar: null, accentColor: null });
  }

  it("pays out once and refuses the same player a second time", async () => {
    const store = new MemoryStore();
    const player = await playerAt(store, "d1");
    const minted = await store.mintCode({
      chips: 2500,
      maxRedemptions: null,
      expiresAt: null,
      note: "launch",
      createdBy: "admin",
    });

    const first = await store.redeem(minted.code, player.id);
    expect(first).toEqual({ ok: true, chips: 2500, balance: STARTING_CHIPS + 2500 });

    const second = await store.redeem(minted.code, player.id);
    expect(second).toEqual({ ok: false, reason: "already-redeemed" });
    expect((await store.get(player.id))?.chips).toBe(STARTING_CHIPS + 2500);
  });

  it("lets a campaign code pay everyone once", async () => {
    const store = new MemoryStore();
    const one = await playerAt(store, "d1");
    const two = await playerAt(store, "d2");
    const minted = await store.mintCode({
      chips: 1000,
      maxRedemptions: null,
      expiresAt: null,
      note: "everyone",
      createdBy: "admin",
    });

    expect((await store.redeem(minted.code, one.id)).ok).toBe(true);
    expect((await store.redeem(minted.code, two.id)).ok).toBe(true);
  });

  it("stops at the limit", async () => {
    const store = new MemoryStore();
    const one = await playerAt(store, "d1");
    const two = await playerAt(store, "d2");
    const minted = await store.mintCode({
      chips: 1000,
      maxRedemptions: 1,
      expiresAt: null,
      note: "first come",
      createdBy: "admin",
    });

    expect((await store.redeem(minted.code, one.id)).ok).toBe(true);
    expect(await store.redeem(minted.code, two.id)).toEqual({ ok: false, reason: "used-up" });
  });

  it("refuses a revoked code even to somebody who had not used it", async () => {
    const store = new MemoryStore();
    const player = await playerAt(store, "d1");
    const minted = await store.mintCode({
      chips: 1000,
      maxRedemptions: null,
      expiresAt: null,
      note: "reposted publicly",
      createdBy: "admin",
    });
    expect(await store.revokeCode(minted.code)).toBe(true);
    expect(await store.redeem(minted.code, player.id)).toEqual({ ok: false, reason: "revoked" });
  });

  it("does not admit whether an unknown code ever existed", async () => {
    const store = new MemoryStore();
    const player = await playerAt(store, "d1");
    expect(await store.redeem("ZZZZ-ZZZZ-ZZ", player.id)).toEqual({
      ok: false,
      reason: "unknown-code",
    });
  });

  it("lists the newest first, which is what an admin is looking for", async () => {
    const store = new MemoryStore();
    for (const note of ["oldest", "middle", "newest"]) {
      await store.mintCode({
        chips: 100,
        maxRedemptions: null,
        expiresAt: null,
        note,
        createdBy: "admin",
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect((await store.listCodes(10)).map((entry) => entry.note)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });
});
