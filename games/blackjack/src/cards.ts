/**
 * A deck of cards, and the shoe they are dealt from.
 *
 * Nothing here knows the rules of any game — a card is a rank and a suit, and
 * what twenty-one makes of that is blackjack's business.
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Ten through king are all ten; an ace is one or eleven, decided per hand. */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** How many decks are in the shoe. Enough that a full table cannot exhaust it. */
export const DECKS = 4;

/** Reshuffled once the shoe is this far down, as a dealer would. */
const RESHUFFLE_AT = 0.25;

export function freshDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

/**
 * Fisher-Yates, taking its randomness from outside.
 *
 * Injected rather than reached for, so a test can deal a known hand — a game
 * whose shuffle cannot be pinned down is a game whose rules cannot be tested.
 */
export function shuffle(cards: Card[], random: () => number): Card[] {
  const out = [...cards];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    [out[at], out[swap]] = [out[swap] as Card, out[at] as Card];
  }
  return out;
}

/**
 * The shoe. Deals from the front and reshuffles when it runs low, so a hand is
 * never dealt from an empty one mid-deal.
 */
export class Shoe {
  private cards: Card[] = [];
  private readonly full = DECKS * 52;

  constructor(private readonly random: () => number) {
    this.refill();
  }

  private refill(): void {
    const all: Card[] = [];
    for (let deck = 0; deck < DECKS; deck += 1) {
      all.push(...freshDeck());
    }
    this.cards = shuffle(all, this.random);
  }

  get remaining(): number {
    return this.cards.length;
  }

  /** True when the next hand should be dealt from a fresh shoe. */
  get spent(): boolean {
    return this.cards.length < this.full * RESHUFFLE_AT;
  }

  /** Reshuffles if the shoe is low. Called between hands, never during one. */
  refresh(): void {
    if (this.spent) {
      this.refill();
    }
  }

  draw(): Card {
    const card = this.cards.pop();
    if (card === undefined) {
      // Cannot happen between refreshes, but a table that stops dealing is
      // worse than one that quietly opens a new shoe.
      this.refill();
      return this.cards.pop() as Card;
    }
    return card;
  }
}
