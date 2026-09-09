import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore, emptyJarRecord } from "./store.js";
import type { JarRecord } from "./store.js";

let store: MemoryStore;
let id: string;

beforeEach(async () => {
  store = new MemoryStore();
  const profile = await store.upsertDiscordUser({
    discordId: "1",
    name: "Someone",
    avatar: null,
    accentColor: null,
  });
  id = profile.id;
});

/** A jar to swap in, distinct from the zero jar so a test can tell they landed. */
function nextJar(overrides: Partial<JarRecord> = {}): JarRecord {
  return { ...emptyJarRecord(), token: "next-token", ...overrides };
}

describe("a jar on the profile", () => {
  it("starts a fresh profile with the zero jar, never touched", async () => {
    const held = await store.jar(id);
    const chips = (await store.get(id))?.chips;
    expect(held).toEqual({ jar: emptyJarRecord(), chips });
    expect(held?.jar.token).toBe("");
  });

  it("has no jar for an unknown player", async () => {
    expect(await store.jar("no-such-id")).toBeNull();
  });

  it("swaps a jar and moves chips together when the token matches", async () => {
    const before = (await store.get(id))?.chips ?? 0;
    const applied = await store.applyJar(id, "", nextJar({ level: 40 }), 25);

    expect(applied.ok).toBe(true);
    expect(applied.chips).toBe(before + 25);
    expect(applied.jar).toEqual(nextJar({ level: 40 }));

    const held = await store.jar(id);
    expect(held?.jar).toEqual(nextJar({ level: 40 }));
    expect(held?.chips).toBe(before + 25);
  });

  it("mints the first token by swapping against a blank one", async () => {
    // A blank token is the never-touched marker; this is how the server
    // hands a jar its first real token on first contact.
    const applied = await store.applyJar(id, "", nextJar({ token: "minted" }), 0);
    expect(applied.ok).toBe(true);
    expect(applied.jar.token).toBe("minted");
    expect(applied.chips).toBe((await store.get(id))?.chips);
  });

  it("refuses a stale token, moves no chips, and hands back the current jar", async () => {
    const before = (await store.get(id))?.chips ?? 0;
    const applied = await store.applyJar(id, "not-the-token", nextJar(), 25);

    expect(applied.ok).toBe(false);
    expect(applied.chips).toBe(before);
    expect(applied.jar).toEqual(emptyJarRecord());
    expect((await store.get(id))?.chips).toBe(before);
  });

  /**
   * The race that would cost real money.
   *
   * A hundred concurrent swaps, all carrying the token a single read handed
   * out before any of them landed. Without the token acting as a
   * compare-and-swap key, every one of them would still match the stored jar
   * and every one of them would get paid — eight sockets tapping the same
   * jar, eight payouts from one scoop.
   */
  it("pays exactly one of a hundred concurrent swaps carrying the same token", async () => {
    const before = (await store.get(id))?.chips ?? 0;
    const held = await store.jar(id);
    const token = held?.jar.token ?? "";

    const results = await Promise.all(
      Array.from({ length: 100 }, () => store.applyJar(id, token, nextJar({ level: 1 }), 25)),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await store.get(id))?.chips).toBe(before + 25);
  });
});
