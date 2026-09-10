import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANKS } from "./Admin.js";

/*
 * The banks the building keeps, and the banks somebody can put a float into.
 *
 * These are two lists in two packages that have to hold the same names, and
 * nothing but somebody remembering made them. The wheel's bank was missing
 * here for a while and nothing failed: the store held it, the route served it
 * and the felt asked it for headroom — there was simply no panel to put the
 * first chips in, and a bank at zero refuses every bet on the cloth. A game
 * that will not take a stake at all, and no error anywhere to say why.
 *
 * Read out of the economy's source rather than imported, because that package
 * is the server's: its entry point pulls in the Mongo driver, and this is the
 * browser bundle.
 */
const store = readFileSync(
  [
    resolve(process.cwd(), "packages/economy/src/store.ts"),
    resolve(process.cwd(), "../../packages/economy/src/store.ts"),
  ].find((path) => existsSync(path)) as string,
  "utf8",
);

/** The names in the economy's own list. */
const kept = (() => {
  const declared = /export const BANKS = \[([^\]]*)\] as const;/.exec(store);
  if (declared === null) {
    throw new Error("The economy no longer declares its banks as a list.");
  }
  return [...declared[1].matchAll(/"([^"]+)"/g)].map(([, name]) => name);
})();

describe("the banks in the admin room", () => {
  it("reads the economy's list at all", () => {
    // The parsing above is doing real work, so it gets its own check: a regex
    // that quietly matched nothing would make every test below pass on an
    // empty list, which is the loudest way to prove nothing.
    expect(kept).toContain("slots");
    expect(kept.length).toBeGreaterThan(1);
  });

  it("has a panel for every bank the building keeps", () => {
    for (const name of kept) {
      expect(BANKS.map((one) => one.game)).toContain(name);
    }
  });

  it("offers no panel for a bank that does not exist", () => {
    // The other way round, because a float posted at a name the store has
    // never heard of is refused and the panel just says so forever.
    for (const panel of BANKS) {
      expect(kept).toContain(panel.game);
    }
  });

  it("gives each one its own name and its own way of saying what it covers", () => {
    // The cap means a different thing in each room — a spin, a hand, a chip on
    // one number — and a panel that borrowed another's wording would be
    // telling an admin something untrue about what they are funding.
    expect(new Set(BANKS.map((one) => one.label)).size).toBe(BANKS.length);
    expect(new Set(BANKS.map((one) => one.per)).size).toBe(BANKS.length);
  });
});
