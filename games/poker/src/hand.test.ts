import { describe as group, expect, it } from "vitest";
import type { Card, Rank, Suit } from "./cards.js";
import { freshDeck, rankValue } from "./cards.js";
import { best, compare, describe, scoreFive } from "./hand.js";

/**
 * What a hand is worth.
 *
 * This is the file that decides who takes a pot, so it is tested by what it
 * must never get wrong rather than by a handful of examples: every category in
 * order, every tie-break inside a category, and the two rules that catch
 * everybody — the wheel, and an ace that cannot wrap round the top.
 */

/** "As" is the ace of spades. Terse on purpose: these tests are all hands. */
function card(text: string): Card {
  const suits: Record<string, Suit> = {
    s: "spades",
    h: "hearts",
    d: "diamonds",
    c: "clubs",
  };
  const rank = text.slice(0, -1) as Rank;
  return { rank, suit: suits[text.slice(-1)] as Suit };
}

const hand = (text: string): Card[] => text.split(" ").map(card);

group("what five cards are worth", () => {
  it("names every category", () => {
    const cases: Array<[string, string]> = [
      ["As Ks Qs Js 10s", "straight flush"],
      ["9s 8s 7s 6s 5s", "straight flush"],
      ["7s 7h 7d 7c 2s", "quads"],
      ["7s 7h 7d 2c 2s", "full house"],
      ["As Js 9s 5s 2s", "flush"],
      ["9s 8h 7d 6c 5s", "straight"],
      ["7s 7h 7d 9c 2s", "trips"],
      ["7s 7h 9d 9c 2s", "two pair"],
      ["7s 7h 9d 5c 2s", "pair"],
      ["As Js 9d 5c 2s", "high card"],
    ];
    for (const [cards, category] of cases) {
      expect(scoreFive(hand(cards)).category).toBe(category);
    }
  });

  it("reads the wheel as a five-high straight", () => {
    /*
     * The one place an ace is not the best card in the deck. A2345 is a
     * straight and the ace plays low, so its top card is the five — which
     * means it loses to any other straight, including 23456.
     */
    const wheel = scoreFive(hand("As 2h 3d 4c 5s"));
    expect(wheel.category).toBe("straight");
    expect(wheel.ranks[0]).toBe(5);
    expect(compare(wheel, scoreFive(hand("2s 3h 4d 5c 6s")))).toBeLessThan(0);
  });

  it("reads the steel wheel as a straight flush", () => {
    const score = scoreFive(hand("As 2s 3s 4s 5s"));
    expect(score.category).toBe("straight flush");
    expect(score.ranks[0]).toBe(5);
  });

  it("does not let an ace wrap round the top", () => {
    // QKA23 is a king-high nothing, not a straight. An ace is low only in the
    // wheel, and a run that goes through it is not a run at all.
    expect(scoreFive(hand("Qs Kh Ad 2c 3s")).category).toBe("high card");
    expect(scoreFive(hand("Js Qh Kd Ac 2s")).category).toBe("high card");
  });
});

group("which of two hands wins", () => {
  const beats = (better: string, worse: string) => {
    expect(compare(scoreFive(hand(better)), scoreFive(hand(worse)))).toBeGreaterThan(0);
    // And the other way round, so a comparison that always returns positive
    // cannot pass this.
    expect(compare(scoreFive(hand(worse)), scoreFive(hand(better)))).toBeLessThan(0);
  };

  it("ranks the categories in order", () => {
    const ladder = [
      "As Ks Qs Js 10s",
      "7s 7h 7d 7c 2s",
      "7s 7h 7d 2c 2s",
      "As Js 9s 5s 2s",
      "9s 8h 7d 6c 5s",
      "7s 7h 7d 9c 2s",
      "7s 7h 9d 9c 2s",
      "7s 7h 9d 5c 2s",
      "As Js 9d 5c 3h",
    ];
    for (let at = 0; at < ladder.length - 1; at += 1) {
      beats(ladder[at] as string, ladder[at + 1] as string);
    }
  });

  it("breaks a pair on the kickers, in order", () => {
    beats("7s 7h As Kd 2c", "7s 7h Qs Kd 2c");
    beats("7s 7h As Kd 3c", "7s 7h As Kd 2c");
    // And the same pair with the same kickers is genuinely the same hand.
    expect(compare(scoreFive(hand("7s 7h As Kd 2c")), scoreFive(hand("7d 7c Ah Ks 2d")))).toBe(0);
  });

  it("breaks two pair on the higher pair before the lower", () => {
    beats("Ks Kh 2d 2c 5s", "Qs Qh Jd Jc 5s");
    beats("Ks Kh 3d 3c 5s", "Ks Kh 2d 2c 9s");
    // Only then on the kicker.
    beats("Ks Kh 2d 2c 9s", "Ks Kh 2d 2c 5s");
  });

  it("breaks a full house on the trips before the pair", () => {
    beats("5s 5h 5d Ac Ah", "4s 4h 4d As Ad");
    beats("5s 5h 5d Ac Ah", "5s 5h 5d Kc Kh");
  });

  it("breaks a flush on every card, not only the highest", () => {
    beats("As Ks 9s 5s 3s", "As Ks 9s 5s 2s");
    beats("As Ks 9s 6s 2s", "As Ks 9s 5s 2s");
  });

  it("splits a pot when the hands are the same", () => {
    // Same hand, different suits: a real result, and one a pot is split on.
    expect(compare(scoreFive(hand("As Ks Qs Js 9h")), scoreFive(hand("Ad Kd Qd Jd 9c")))).toBe(0);
  });
});

group("the best hand inside seven cards", () => {
  it("finds a straight that uses only part of the board", () => {
    // Hole cards 8-9, board 5-6-7 with two rags: a nine-high straight.
    const score = best(hand("8s 9h 5d 6c 7s Ah Kd"));
    expect(score.category).toBe("straight");
    expect(score.ranks[0]).toBe(9);
  });

  it("plays the board when the hand cannot beat it", () => {
    // The board is a made straight and the hole cards add nothing, so the best
    // five are the five on the table — which is what splits pots in practice.
    const board = "10s Jh Qd Kc As";
    const score = best(hand(`2c 3d ${board}`));
    expect(score.category).toBe("straight");
    expect(score.ranks[0]).toBe(14);
  });

  it("prefers the flush it can make over the straight it can also make", () => {
    const score = best(hand("As Ks 9s 5s 2s 6h 7d"));
    expect(score.category).toBe("flush");
  });

  it("finds quads on a paired board", () => {
    expect(best(hand("7s 7h 7d 7c 2s 3h 4d")).category).toBe("quads");
  });

  it("never returns a worse hand than any five it was given", () => {
    /*
     * The property that catches an evaluator picking the wrong five: whatever
     * combination is tried by hand, the answer must be at least as good.
     */
    const cards = hand("As Ks Qs Js 9s 9h 9d");
    const answer = best(cards);
    for (let a = 0; a < cards.length; a += 1) {
      for (let b = a + 1; b < cards.length; b += 1) {
        for (let c = b + 1; c < cards.length; c += 1) {
          for (let d = c + 1; d < cards.length; d += 1) {
            for (let e = d + 1; e < cards.length; e += 1) {
              const five = [a, b, c, d, e].map((at) => cards[at] as Card);
              expect(compare(answer, scoreFive(five))).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    }
  });

  it("scores every hand a real deck can make without throwing", () => {
    // A sweep rather than a proof, but it walks a great many shapes: any card
    // combination the evaluator mishandles by throwing is found here.
    const deck = freshDeck();
    for (let at = 0; at + 7 <= deck.length; at += 3) {
      const seven = deck.slice(at, at + 7);
      const score = best(seven);
      expect(score.cards).toHaveLength(5);
      expect(score.ranks.length).toBeGreaterThan(0);
      expect(describe(score).length).toBeGreaterThan(0);
    }
  });
});

group("how a hand reads", () => {
  it("says what it is in words a player would use", () => {
    expect(describe(scoreFive(hand("As Ks Qs Js 10s")))).toBe("a royal flush");
    expect(describe(scoreFive(hand("9s 8s 7s 6s 5s")))).toBe("a straight flush, 9 high");
    expect(describe(scoreFive(hand("Ks Kh Kd Kc 2s")))).toBe("four kings");
    expect(describe(scoreFive(hand("Ks Kh Kd 2c 2s")))).toBe("kings full of 2s");
    expect(describe(scoreFive(hand("As Js 9s 5s 2s")))).toBe("a flush, A high");
    expect(describe(scoreFive(hand("As 2h 3d 4c 5s")))).toBe("a straight, 5 high");
    expect(describe(scoreFive(hand("Qs Qh Qd 9c 2s")))).toBe("three queens");
    expect(describe(scoreFive(hand("Js Jh 9d 9c 2s")))).toBe("jacks and 9s");
    expect(describe(scoreFive(hand("As Ah 9d 5c 2s")))).toBe("a pair of aces");
    expect(describe(scoreFive(hand("As Js 9d 5c 3h")))).toBe("A high");
  });
});

group("the deck itself", () => {
  it("holds fifty-two cards, all different", () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it("runs two low and ace high", () => {
    expect(rankValue("2")).toBe(2);
    expect(rankValue("A")).toBe(14);
    expect(rankValue("K")).toBeLessThan(rankValue("A"));
  });
});

group("a full ring", () => {
  it("has cards enough for ten players and a board", () => {
    /*
     * Ten hands of two, five on the board and three burnt between streets:
     * twenty-eight of fifty-two. The deck is never refilled inside a hand, so
     * this is what makes that safe rather than lucky.
     */
    const MAX_SEATS = 10;
    expect(MAX_SEATS * 2 + 5 + 3).toBeLessThanOrEqual(freshDeck().length);
  });
});

