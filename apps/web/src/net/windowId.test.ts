// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Imported fresh in every test, never at the top of the file.
 *
 * The module holds the id in memory as well as in the store, so a test that
 * imported once would be answered from that memory and would never reach the
 * store it is trying to say something about — including, silently, the two
 * below that mock it. A fresh module per test is what a fresh page load is.
 */
async function load() {
  vi.resetModules();
  return await import("./windowId.js");
}

describe("a window's name for itself", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("is the same one twice", async () => {
    const { windowId } = await load();
    expect(windowId()).toBe(windowId());
  });

  it("survives a refresh, which is what sessionStorage buys", async () => {
    const first = (await load()).windowId();
    // A refresh is a fresh module against the same store. That is the whole
    // claim, so it is made with a genuinely fresh module rather than a reread.
    const { WINDOW_KEY, windowId } = await load();
    expect(window.sessionStorage.getItem(WINDOW_KEY)).toBe(first);
    expect(windowId()).toBe(first);
  });

  it("does not hand a second tab the first one's name", async () => {
    /*
     * sessionStorage is per tab, which a single jsdom cannot have two of. What
     * is checkable here is the half that matters: an empty store yields a new
     * id rather than a constant.
     */
    const first = (await load()).windowId();
    window.sessionStorage.clear();
    const second = (await load()).windowId();
    expect(second).not.toBe(first);
  });

  it("still answers when the store will not have it", async () => {
    /*
     * A private window can throw outright on both reads and writes. A browser
     * that will not remember is not a reason to refuse to play — such a window
     * still claims its game, it just cannot prove itself across a refresh.
     */
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("nope");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("nope");
    });
    const { windowId } = await load();
    const id = windowId();
    expect(id.length).toBeGreaterThan(0);
    // Still stable within the page, because it is held in memory too.
    expect(windowId()).toBe(id);
  });
});
