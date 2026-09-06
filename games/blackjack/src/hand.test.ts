import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards.js";
import { isBlackjack, value } from "./hand.js";

/** A hand written the way a person would say it: "A", "K", "7". */
function hand(...ranks: Rank[]): Card[] {
  return ranks.map((rank) => ({ rank, suit: "spades" as const }));
}

describe("what a hand is worth", () => {
  it("adds up the plain ones", () => {
    expect(value(hand("2", "3")).total).toBe(5);
    expect(value(hand("K", "9")).total).toBe(19);
  });

  it("counts every court card as ten", () => {
    for (const rank of ["10", "J", "Q", "K"] as Rank[]) {
      expect(value(hand(rank, "5")).total).toBe(15);
    }
  });

  it("makes an ace eleven when there is room", () => {
    expect(value(hand("A", "6"))).toEqual({ total: 17, soft: true, bust: false });
  });

  it("drops the ace to one when eleven would bust", () => {
    expect(value(hand("A", "6", "K"))).toEqual({ total: 17, soft: false, bust: false });
  });

  it("never counts two aces as twenty-two", () => {
    /*
     * The classic bug. Only one ace can be eleven without busting, so the hand
     * is counted low and promoted once — never once per ace.
     */
    expect(value(hand("A", "A"))).toEqual({ total: 12, soft: true, bust: false });
    expect(value(hand("A", "A", "A"))).toEqual({ total: 13, soft: true, bust: false });
    expect(value(hand("A", "A", "9"))).toEqual({ total: 21, soft: true, bust: false });
  });

  it("knows when a hand is beyond saving", () => {
    expect(value(hand("K", "Q", "5"))).toEqual({ total: 25, soft: false, bust: true });
  });

  it("hardens a soft hand rather than busting it", () => {
    // Soft 17, then a ten: seventeen becomes seventeen, not twenty-seven.
    expect(value(hand("A", "6", "10"))).toEqual({ total: 17, soft: false, bust: false });
  });
});

describe("blackjack itself", () => {
  it("is twenty-one on the first two cards", () => {
    expect(isBlackjack(hand("A", "K"))).toBe(true);
    expect(isBlackjack(hand("10", "A"))).toBe(true);
  });

  it("is not twenty-one reached the long way", () => {
    // Worth less than a blackjack, and the payout depends on the difference.
    expect(value(hand("7", "7", "7")).total).toBe(21);
    expect(isBlackjack(hand("7", "7", "7"))).toBe(false);
  });
});
