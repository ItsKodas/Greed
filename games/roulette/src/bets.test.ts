import { describe, expect, it } from "vitest";
import { needed, staked } from "./bank.js";
import { type Placed, settle, toBets } from "./bets.js";
import { spotAt } from "./spots.js";
import { WHEEL } from "./wheel.js";

const RED_ID = "even:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36";

const put = (seatId: string, spotId: string, chips: number): Placed => ({ seatId, spotId, chips });

describe("settling a spin", () => {
  it("hands back the stake and the winnings together", () => {
    const paid = settle([put("s1", "straight:17", 100)], 17);
    expect(paid.get("s1")).toEqual({ back: 3_600, staked: 100, won: [{ spotId: "straight:17", back: 3_600 }] });
  });

  it("gives nothing back on a losing bet", () => {
    const paid = settle([put("s1", "straight:17", 100)], 18);
    expect(paid.get("s1")).toEqual({ back: 0, staked: 100, won: [] });
  });

  it("pays every bet that covered the pocket", () => {
    const paid = settle(
      [put("s1", "straight:17", 100), put("s1", "split:17-20", 100), put("s1", "straight:5", 100)],
      17,
    );
    expect(paid.get("s1")?.back).toBe(3_600 + 1_800);
    expect(paid.get("s1")?.staked).toBe(300);
  });

  it("keeps each seat's chips apart", () => {
    const paid = settle([put("s1", RED_ID, 200), put("s2", RED_ID, 500)], 32);
    expect(paid.get("s1")?.back).toBe(400);
    expect(paid.get("s2")?.back).toBe(1_000);
  });

  it("takes every even-money bet when the zero comes up", () => {
    // The house edge, in one test. Nothing outside wins on a zero.
    const paid = settle([put("s1", RED_ID, 500), put("s2", "dozen:1-2-3-4-5-6-7-8-9-10-11-12", 500)], 0);
    expect(paid.get("s1")?.back).toBe(0);
    expect(paid.get("s2")?.back).toBe(0);
  });

  it("still pays the zero's own bets when it comes up", () => {
    const paid = settle([put("s1", "straight:0", 100), put("s1", "basket:0-1-2-3", 80)], 0);
    expect(paid.get("s1")?.back).toBe(3_600 + 720);
  });

  it("drops a bet naming a spot that does not exist", () => {
    // Belt and braces: the table refuses these when they are placed. If one
    // ever reached here it must be worth nothing rather than crash the spin.
    const paid = settle([put("s1", "straight:99", 100), put("s1", "straight:17", 100)], 17);
    expect(paid.get("s1")?.back).toBe(3_600);
  });

  it("never pays out more than the bank promised, whatever the ball does", () => {
    /*
     * The two halves of this package meeting: bank.ts says what a cloth needs,
     * and this says what it actually pays. If they ever disagree the table
     * either mints chips or short-pays a winner, and both are the kind of bug
     * CLAUDE.md's money rules exist to stop.
     */
    const bets = [
      put("s1", "straight:0", 40),
      put("s1", "corner:1-2-4-5", 70),
      put("s2", RED_ID, 250),
      put("s2", "six:1-2-3-4-5-6", 60),
      put("s3", "column:3-6-9-12-15-18-21-24-27-30-33-36", 130),
    ];
    const bank = needed(toBets(bets));
    const onCloth = staked(toBets(bets));
    for (const pocket of WHEEL) {
      const paid = settle(bets, pocket);
      let out = 0;
      for (const seat of paid.values()) out += seat.back;
      expect(out).toBeLessThanOrEqual(bank + onCloth);
    }
  });

  it("turns placed chips into what the bank reasons about", () => {
    const bets = toBets([put("s1", "straight:17", 100), put("s2", "straight:99", 50)]);
    expect(bets).toHaveLength(1);
    expect(bets[0]?.spot).toBe(spotAt("straight:17"));
  });
});
