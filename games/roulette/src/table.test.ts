import { TableError } from "@backroom/core";
import { describe, expect, it } from "vitest";
import { LAST_CALL_MS, Table } from "./table.js";

const RED = "even:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36";

/** Somebody signed in, which a table playing for chips insists on. */
const who = (userId: string) => ({ userId, avatar: null, accentColor: null });

/** A table with one seat, and the ball sent wherever a test wants it. */
const table = (at = 0) => {
  const one = new Table("ABCDE", 6, { pick: () => at });
  const seat = one.join("s1", "Ada", who("u1"));
  return { one, seat };
};

describe("a roulette table", () => {
  it("opens taking bets", () => {
    const { one } = table();
    expect(one.phase).toBe("betting");
    expect(one.deadline).not.toBeNull();
  });

  it("takes a chip on a real spot", () => {
    const { one } = table();
    one.place("s1", "straight:17", 100);
    expect(one.placed).toEqual([{ seatId: "s1", spotId: "straight:17", chips: 100 }]);
  });

  it("piles chips up on the same spot rather than listing them twice", () => {
    const { one } = table();
    one.place("s1", "straight:17", 100);
    one.place("s1", "straight:17", 50);
    expect(one.placed).toEqual([{ seatId: "s1", spotId: "straight:17", chips: 150 }]);
  });

  it("keeps two seats' chips on one spot apart", () => {
    const { one } = table();
    one.join("s2", "Bram", who("u2"));
    one.place("s1", RED, 100);
    one.place("s2", RED, 200);
    expect(one.placed).toHaveLength(2);
    expect(one.onSpot("s1", RED)).toBe(100);
    expect(one.onSpot("s2", RED)).toBe(200);
  });

  it("refuses a spot that is not on the cloth", () => {
    const { one } = table();
    expect(() => one.place("s1", "straight:99", 100)).toThrow(TableError);
    expect(() => one.place("s1", "split:1-7", 100)).toThrow(TableError);
    expect(one.placed).toHaveLength(0);
  });

  it("refuses chips once the wheel is turning", () => {
    const { one } = table();
    one.place("s1", RED, 50);
    one.closeBetting();
    expect(one.phase).toBe("spinning");
    expect(() => one.place("s1", "straight:17", 100)).toThrow(TableError);
  });

  it("refuses a bet from somebody who is not sitting there", () => {
    const { one } = table();
    expect(() => one.place("nobody", "straight:17", 100)).toThrow(TableError);
  });

  it("takes a chip back, most recent first", () => {
    const { one } = table();
    one.place("s1", "straight:17", 100);
    one.place("s1", RED, 50);
    one.undo("s1");
    expect(one.placed).toEqual([{ seatId: "s1", spotId: "straight:17", chips: 100 }]);
  });

  it("takes a chip back off one spot", () => {
    const { one } = table();
    one.place("s1", "straight:17", 150);
    expect(one.take("s1", "straight:17", 50)).toBe(50);
    expect(one.onSpot("s1", "straight:17")).toBe(100);
  });

  it("clears the pile when the last chip comes off it", () => {
    const { one } = table();
    one.place("s1", "straight:17", 100);
    expect(one.take("s1", "straight:17", 100)).toBe(100);
    expect(one.placed).toHaveLength(0);
  });

  it("takes back only what is actually there", () => {
    // Asking for more than the pile holds takes the pile, not a debt.
    const { one } = table();
    one.place("s1", "straight:17", 50);
    expect(one.take("s1", "straight:17", 500)).toBe(50);
    expect(one.placed).toHaveLength(0);
  });

  it("never takes a chip that is not yours", () => {
    /*
     * The whole reason this is per seat rather than per spot. Two people bet
     * red every spin; one of them reaching for the pile and taking the other's
     * chips back would be theft with a right-click.
     */
    const { one } = table();
    one.join("s2", "Bram", who("u2"));
    one.place("s2", RED, 500);
    expect(one.take("s1", RED, 500)).toBe(0);
    expect(one.onSpot("s2", RED)).toBe(500);
  });

  it("gives nothing back off a spot with nothing on it", () => {
    const { one } = table();
    expect(one.take("s1", "straight:17", 100)).toBe(0);
  });

  it("refuses to take a chip back once the wheel is turning", () => {
    const { one } = table();
    one.place("s1", RED, 50);
    one.closeBetting();
    expect(() => one.take("s1", RED, 50)).toThrow(TableError);
  });

  it("sweeps one seat's chips off without touching anybody else's", () => {
    const { one } = table();
    one.join("s2", "Bram", who("u2"));
    one.place("s1", RED, 100);
    one.place("s2", RED, 200);
    one.clear("s1");
    expect(one.placed).toEqual([{ seatId: "s2", spotId: RED, chips: 200 }]);
  });

  it("says when the window is nearly shut", () => {
    const { one } = table();
    expect(one.lastCall).toBe(false);
    one.deadline = Date.now() + one.lastCallMs - 1;
    expect(one.lastCall).toBe(true);
  });

  it("still takes bets at a table whose window is shorter than last call", () => {
    /*
     * A flat five-second last call inverts on any window shorter than itself:
     * the table opens already past the cut-off and refuses every bet for the
     * whole window. Held to a third of the window instead, so a short table is
     * a fast one rather than a broken one.
     */
    const quick = new Table("ABCDE", 6, { pick: () => 0, window: 1_000 });
    quick.join("s1", "Ada", who("u1"));
    expect(quick.lastCall).toBe(false);
    expect(quick.lastCallMs).toBeLessThan(LAST_CALL_MS);
    expect(() => quick.place("s1", RED, 50)).not.toThrow();
  });

  it("decides where the ball went the moment betting closes", () => {
    /*
     * Before the animation rather than after it. The felt has to know the
     * pocket to roll the ball into it, and by then the bets are locked, so
     * knowing early buys a player exactly nothing.
     */
    const { one } = table(1);
    one.place("s1", "straight:32", 100);
    expect(one.pocket).toBeNull();
    one.closeBetting();
    expect(one.pocket).toBe(32);
  });

  it("pays what the cloth says once the ball lands", () => {
    const { one } = table(1);
    one.place("s1", "straight:32", 100);
    one.closeBetting();
    one.land();
    expect(one.phase).toBe("settled");
    expect(one.paid?.get("s1")).toEqual({
      back: 3_600,
      staked: 100,
      won: [{ spotId: "straight:32", back: 3_600 }],
    });
  });

  it("does not turn the wheel for an empty cloth", () => {
    // A wheel spinning to nobody is a stream of results that mean nothing. It
    // waits, with the felt untouched, and opens a fresh window instead.
    const { one } = table();
    one.closeBetting();
    expect(one.phase).toBe("betting");
    expect(one.pocket).toBeNull();
  });

  it("clears the cloth for the next spin", () => {
    const { one } = table(1);
    one.place("s1", "straight:32", 100);
    one.closeBetting();
    one.land();
    one.beginBetting();
    expect(one.phase).toBe("betting");
    expect(one.placed).toHaveLength(0);
    expect(one.pocket).toBeNull();
    expect(one.paid).toBeNull();
  });

  it("remembers the last spin's chips so they can be put down again", () => {
    /*
     * Remembered rather than replayed here: putting them back down goes
     * through the adapter, because each chip has to be checked against the
     * bank again. The cloth is not the same cloth it was last spin.
     */
    const { one } = table(1);
    one.place("s1", "straight:32", 100);
    one.place("s1", RED, 50);
    one.closeBetting();
    one.land();
    one.beginBetting();
    expect(one.lastRound("s1")).toEqual([
      { seatId: "s1", spotId: "straight:32", chips: 100 },
      { seatId: "s1", spotId: RED, chips: 50 },
    ]);
  });

  it("keeps a short history of where the ball has been", () => {
    const one = new Table("ABCDE", 6, { pick: () => 1 });
    one.join("s1", "Ada", who("u1"));
    for (let go = 0; go < 3; go += 1) {
      one.place("s1", RED, 50);
      one.closeBetting();
      one.land();
      one.beginBetting();
    }
    expect(one.history).toEqual([32, 32, 32]);
  });

  it("says what the bank can be measured against, from the moment it exists", () => {
    /*
     * A fresh table must not show a bank of nothing. This was a number the
     * adapter set after each broadcast, which meant a table nobody had touched
     * yet reported zero and greyed out every spot on the cloth — a table
     * unusable until somebody managed a bet on it.
     */
    const { one } = table();
    one.forFun = true;
    expect(one.bank).toBeGreaterThan(0);
  });

  it("does not let the cloth's own chips vouch for the bank", () => {
    // Chips go into the bank as they land, so a figure that counted them would
    // grow with every bet and let the cloth talk itself into more.
    const { one } = table();
    one.forFun = true;
    const before = one.bank;
    one.place("s1", RED, 500);
    expect(one.bank).toBe(before - 500);
  });

  it("says whether there is a last round to put down again", () => {
    // A button offering to repeat nothing is a button that lies.
    const { one } = table(1);
    expect(one.view("s1").canRepeat).toBe(false);
    one.place("s1", RED, 50);
    one.closeBetting();
    one.land();
    one.beginBetting();
    expect(one.view("s1").canRepeat).toBe(true);
    // And it is per seat: somebody who was not in that spin has nothing.
    one.join("s2", "Bram", who("u2"));
    expect(one.view("s2").canRepeat).toBe(false);
  });

  it("shows a watcher the cloth but never anybody's account", () => {
    const { one } = table();
    one.place("s1", "straight:17", 100);
    const seen = one.view(null);
    expect(seen.placed).toHaveLength(1);
    expect(seen.you).toBeNull();
  });
});
