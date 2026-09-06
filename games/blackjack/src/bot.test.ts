import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "./cards.js";
import { decide, upcardValue } from "./bot.js";

const card = (rank: Rank, suit: Suit = "spades"): Card => ({ rank, suit });
const hand = (...ranks: Rank[]) => ranks.map((rank) => card(rank));

/** Basic strategy with everything the bot is allowed to know, and no more. */
const hard = (cards: Card[], upcard: number, canDouble = cards.length === 2) =>
  decide({ cards, upcard, canDouble, skill: "hard" });

describe("what the dealer's upcard is worth", () => {
  it("counts an ace high and every ten the same", () => {
    expect(upcardValue(card("A"))).toBe(11);
    for (const rank of ["10", "J", "Q", "K"] as Rank[]) {
      expect(upcardValue(card(rank))).toBe(10);
    }
    expect(upcardValue(card("6"))).toBe(6);
  });
});

describe("hard hands", () => {
  it("stands on seventeen and above whatever is showing", () => {
    for (let upcard = 2; upcard <= 11; upcard += 1) {
      expect(hard(hand("10", "7"), upcard)).toBe("stand");
      expect(hard(hand("10", "9"), upcard)).toBe("stand");
    }
  });

  it("stands stiff against a bust card and hits against a good one", () => {
    // Sixteen is the hand the whole game turns on: standing loses often, and
    // hitting loses more often — but only against a dealer who is not stuck.
    expect(hard(hand("10", "6"), 6)).toBe("stand");
    expect(hard(hand("10", "6"), 7)).toBe("hit");
    expect(hard(hand("10", "3"), 2)).toBe("stand");
    expect(hard(hand("10", "3"), 10)).toBe("hit");
  });

  it("treats twelve as its own case", () => {
    // Twelve stands only against four, five and six — against two and three
    // the dealer busts too rarely to be worth standing on.
    expect(hard(hand("10", "2"), 2)).toBe("hit");
    expect(hard(hand("10", "2"), 3)).toBe("hit");
    expect(hard(hand("10", "2"), 4)).toBe("stand");
    expect(hard(hand("10", "2"), 6)).toBe("stand");
    expect(hard(hand("10", "2"), 7)).toBe("hit");
  });

  it("doubles where doubling is right and hits where it is not allowed", () => {
    expect(hard(hand("6", "5"), 10)).toBe("double");
    expect(hard(hand("6", "4"), 9)).toBe("double");
    expect(hard(hand("6", "4"), 10)).toBe("hit");
    expect(hard(hand("5", "4"), 4)).toBe("double");
    expect(hard(hand("5", "4"), 2)).toBe("hit");
    // Three cards is no longer a doubling hand, whatever it adds up to.
    expect(hard(hand("4", "3", "4"), 10)).toBe("hit");
  });

  it("always hits eight and below", () => {
    for (let upcard = 2; upcard <= 11; upcard += 1) {
      expect(hard(hand("4", "4"), upcard)).toBe("hit");
      expect(hard(hand("2", "3"), upcard)).toBe("hit");
    }
  });
});

describe("soft hands", () => {
  it("stands on soft nineteen and above", () => {
    for (let upcard = 2; upcard <= 11; upcard += 1) {
      expect(hard(hand("A", "8"), upcard)).toBe("stand");
    }
  });

  it("gets soft eighteen right, which is where most hands are thrown away", () => {
    expect(hard(hand("A", "7"), 2)).toBe("stand");
    expect(hard(hand("A", "7"), 4)).toBe("double");
    expect(hard(hand("A", "7"), 7)).toBe("stand");
    expect(hard(hand("A", "7"), 9)).toBe("hit");
    expect(hard(hand("A", "7"), 11)).toBe("hit");
    // Same hand, no longer doublable: the double becomes a stand, not a hit,
    // because standing was always the second-best answer against a four.
    expect(hard(hand("A", "4", "3"), 4)).toBe("stand");
  });

  it("hits soft totals it cannot double", () => {
    expect(hard(hand("A", "2"), 10)).toBe("hit");
    expect(hard(hand("A", "5"), 10)).toBe("hit");
    expect(hard(hand("A", "6"), 2)).toBe("hit");
  });

  it("never busts a hand that cannot bust", () => {
    // Every soft total below nineteen takes a card or doubles into one; none
    // of them stands, because a soft hand cannot be hurt by one more card.
    for (const cards of [hand("A", "2"), hand("A", "3"), hand("A", "4"), hand("A", "5")]) {
      for (let upcard = 2; upcard <= 11; upcard += 1) {
        expect(hard(cards, upcard)).not.toBe("stand");
      }
    }
  });
});

describe("the other two skills", () => {
  it("has the easy bot play the dealer's own rules", () => {
    const easy = (cards: Card[], upcard: number) =>
      decide({ cards, upcard, canDouble: true, skill: "easy" });
    // No upcard changes its mind, which is exactly what makes it worse.
    expect(easy(hand("10", "6"), 6)).toBe("hit");
    expect(easy(hand("10", "6"), 10)).toBe("hit");
    expect(easy(hand("10", "7"), 6)).toBe("stand");
    // Soft seventeen included: it stands, because the dealer at this table
    // stands on seventeen soft or hard and this bot is copying that rule.
    expect(easy(hand("A", "6"), 6)).toBe("stand");
    expect(easy(hand("A", "5"), 6)).toBe("hit");
  });

  it("has the normal bot play basic strategy but never double", () => {
    const normal = (cards: Card[], upcard: number) =>
      decide({ cards, upcard, canDouble: true, skill: "normal" });
    expect(normal(hand("6", "5"), 10)).toBe("hit");
    expect(normal(hand("A", "7"), 4)).toBe("stand");
    // Everything that is not a double is played the same as the hard bot.
    expect(normal(hand("10", "6"), 6)).toBe("stand");
    expect(normal(hand("10", "6"), 7)).toBe("hit");
  });
});
