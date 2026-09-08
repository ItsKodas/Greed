/**
 * A deck, and the deal it comes off.
 *
 * Nothing here knows the rules of any game — a card is a rank and a suit, and
 * what a flush makes of that is hold'em's business.
 *
 * Written again rather than shared with blackjack's, because the two want
 * opposite things. Blackjack deals from a four-deck shoe carried between
 * hands; poker deals one hand from one deck and burns the rest. A shoe here
 * would let the same card arrive twice in a hand, which is the one thing a
 * game about the odds of a card cannot survive.
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Two low, ace high — and only high. Hold'em has no soft ace to decide. */
export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

/**
 * What a rank is worth when hands are compared.
 *
 * Two is two and an ace is fourteen, so a straight is a run of consecutive
 * numbers and nothing has to special-case a letter. The wheel — A2345 — is the
 * one exception, and it is handled where straights are found rather than here,
 * because an ace is only ever low as part of that one run.
 */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2;
}

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
 * Injected rather than reached for, so a test can deal a known board — a game
 * whose shuffle cannot be pinned down is a game whose rules cannot be tested.
 * The server hands it a cryptographic source; nothing else may.
 */
export function shuffle(cards: Card[], random: () => number): Card[] {
  const out = [...cards];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    const held = out[at] as Card;
    out[at] = out[swap] as Card;
    out[swap] = held;
  }
  return out;
}

/**
 * One deck, dealt from the top and never refilled.
 *
 * A hand of hold'em needs at most twenty-two cards — nine players' hole cards
 * and five on the board — so a fifty-two card deck cannot run out inside one.
 * It throws rather than reshuffling if it ever does: a deck that quietly opens
 * a second one has dealt somebody a card that is already on the table.
 */
export class Deck {
  private cards: Card[];

  constructor(random: () => number) {
    this.cards = shuffle(freshDeck(), random);
  }

  get remaining(): number {
    return this.cards.length;
  }

  draw(): Card {
    const card = this.cards.pop();
    if (card === undefined) {
      throw new Error("The deck is empty.");
    }
    return card;
  }
}
