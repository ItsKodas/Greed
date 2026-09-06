import { describe, expect, it } from "vitest";
import { DECKS, Shoe, freshDeck, shuffle } from "./cards.js";

/** A predictable "random" so a shuffle can be asserted rather than guessed at. */
function sequence(...values: number[]) {
  let at = 0;
  return () => values[at++ % values.length] as number;
}

describe("a deck", () => {
  it("is fifty-two distinct cards", () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => `${card.rank}${card.suit}`)).size).toBe(52);
  });
});

describe("shuffling", () => {
  it("keeps every card and changes the order", () => {
    const deck = freshDeck();
    const shuffled = shuffle(deck, sequence(0.7, 0.1, 0.9, 0.3, 0.5));
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map((card) => `${card.rank}${card.suit}`)).size).toBe(52);
    expect(shuffled.map((card) => card.rank).join("")).not.toBe(deck.map((c) => c.rank).join(""));
  });

  it("leaves the deck it was given alone", () => {
    const deck = freshDeck();
    const before = deck.map((card) => card.rank).join("");
    shuffle(deck, Math.random);
    expect(deck.map((card) => card.rank).join("")).toBe(before);
  });
});

describe("the shoe", () => {
  it("starts full", () => {
    expect(new Shoe(Math.random).remaining).toBe(DECKS * 52);
  });

  it("deals cards away", () => {
    const shoe = new Shoe(Math.random);
    shoe.draw();
    shoe.draw();
    expect(shoe.remaining).toBe(DECKS * 52 - 2);
  });

  it("only reshuffles between hands, and only when low", () => {
    const shoe = new Shoe(Math.random);
    shoe.refresh();
    expect(shoe.remaining).toBe(DECKS * 52);

    // Down past a quarter, which is where a dealer would reach for a new shoe.
    while (!shoe.spent) {
      shoe.draw();
    }
    const low = shoe.remaining;
    shoe.refresh();
    expect(shoe.remaining).toBeGreaterThan(low);
  });

  it("never fails to deal, even asked past the end", () => {
    const shoe = new Shoe(Math.random);
    for (let card = 0; card < DECKS * 52 + 5; card += 1) {
      expect(shoe.draw()).toBeDefined();
    }
  });
});
