import type { Card, Rank } from "./cards.js";
import { rankValue } from "./cards.js";

/**
 * What a hand is worth, and which of two is better.
 *
 * The whole of poker's arithmetic lives here. Everything else in this package
 * moves chips around; this decides who gets them, so it is the file to be sure
 * of — and it is pure, which is why it can be.
 *
 * A hand is scored rather than described: a category, then the ranks that
 * break ties within it, in the order they break them. Two hands compare by
 * walking those numbers left to right, which is exactly how a person compares
 * them out loud — "trip kings" first, then "with an ace", then "and a nine".
 */

export const CATEGORIES = [
  "high card",
  "pair",
  "two pair",
  "trips",
  "straight",
  "flush",
  "full house",
  "quads",
  "straight flush",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * What a hand is called, when it is being shown to somebody.
 *
 * The list above is what a card room says out loud — trips, quads — and this
 * is the same thing written the way it appears on the wall beside the table.
 * Both exist because they are for different readers: the short ones are for
 * the code, and nobody learning the game has met them.
 */
export const TITLES: Record<Category, string> = {
  "high card": "High card",
  pair: "One pair",
  "two pair": "Two pair",
  trips: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  "full house": "Full house",
  quads: "Four of a kind",
  "straight flush": "Straight flush",
};

/**
 * The cards that actually make the hand, without the ones riding along.
 *
 * Five cards score a hand but five cards are rarely what the hand *is*. A pair
 * of nines is two cards; the king, ten and eight beside them are kickers —
 * they settle ties and they are not the pair. Pointing at all five says "these
 * five are your hand", which is true and is not the thing somebody learning
 * needs to see; pointing at the two nines says what they have.
 *
 * A straight, a flush and a full house are the exceptions, and they are not
 * exceptions really: all five cards are load-bearing in each, so all five are
 * the hand.
 */
export function meaningful(score: Score): Card[] {
  const ofRanks = (howMany: number): Card[] => {
    const keep = new Set(score.ranks.slice(0, howMany));
    return score.cards.filter((card) => keep.has(rankValue(card.rank)));
  };

  switch (score.category) {
    case "straight flush":
    case "flush":
    case "straight":
    case "full house":
      return score.cards;
    case "quads":
    case "trips":
    case "pair":
      return ofRanks(1);
    case "two pair":
      return ofRanks(2);
    default: {
      /*
       * High card: the one card that is playing. `ranks` here is every rank in
       * order, so the first is the card doing the work and the rest are the
       * kickers behind it.
       */
      const top = score.ranks[0];
      const best = score.cards.find((card) => rankValue(card.rank) === top);
      return best === undefined ? [] : [best];
    }
  }
}

/** The name of a hand, allowing for the one that has a name of its own. */
export function title(score: Score): string {
  return score.category === "straight flush" && score.ranks[0] === 14
    ? "Royal flush"
    : TITLES[score.category];
}

export interface Score {
  category: Category;
  /**
   * The ranks that decide it, most significant first.
   *
   * For a full house: the trips rank, then the pair's. For two pair: the
   * higher pair, the lower, then the kicker. For a flush or a high card: all
   * five, high to low. The list is only ever as long as it needs to be, and
   * two scores of the same category always have lists of the same length.
   */
  ranks: number[];
  /** The five cards that made it, for a felt that wants to show them. */
  cards: Card[];
}

/** Where a category sits, low to high. */
function strength(category: Category): number {
  return CATEGORIES.indexOf(category);
}

/**
 * Which of two scores is better: positive if `a` is, negative if `b` is, zero
 * if they are the same hand.
 *
 * Zero is a real answer and not a fallback. Two players genuinely can hold the
 * same hand — the board can be the whole of it — and a pot is split when they
 * do, so this must not invent a winner to avoid the case.
 */
export function compare(a: Score, b: Score): number {
  const byCategory = strength(a.category) - strength(b.category);
  if (byCategory !== 0) {
    return byCategory;
  }
  for (let at = 0; at < Math.max(a.ranks.length, b.ranks.length); at += 1) {
    const left = a.ranks[at] ?? 0;
    const right = b.ranks[at] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
}

/** Every way to choose five from the cards given, as index lists. */
function choose5(count: number): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      for (let c = b + 1; c < count; c += 1) {
        for (let d = c + 1; d < count; d += 1) {
          for (let e = d + 1; e < count; e += 1) {
            out.push([a, b, c, d, e]);
          }
        }
      }
    }
  }
  return out;
}

/**
 * The top of a straight in these five ranks, or zero if they are not one.
 *
 * The wheel is the exception the rest of the file does not have to know about:
 * A2345 is a straight, and the ace plays low, so it is the *five* that is its
 * top card. Written here because this is the only place an ace is ever
 * anything but the highest card in the deck.
 */
function straightTop(sorted: number[]): number {
  const run = [...new Set(sorted)].sort((first, second) => second - first);
  if (run.length !== 5) {
    return 0;
  }
  if ((run[0] as number) - (run[4] as number) === 4) {
    return run[0] as number;
  }
  const wheel = [14, 5, 4, 3, 2];
  return run.every((value, at) => value === wheel[at]) ? 5 : 0;
}

/** What exactly these five cards are worth. */
export function scoreFive(cards: Card[]): Score {
  if (cards.length !== 5) {
    throw new Error("A poker hand is five cards.");
  }
  const values = cards.map((card) => rankValue(card.rank));
  const sorted = [...values].sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === (cards[0] as Card).suit);
  const top = straightTop(sorted);

  /*
   * Ranks by how many of them there are, then by rank. Which is the whole of
   * the tie-breaking rule: trips beat a pair inside a full house, and the
   * higher pair beats the lower inside two pair, so counting first and ranking
   * second produces the comparison list in the order it is read.
   */
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const grouped = [...counts.entries()].sort(
    ([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA,
  );
  const shape = grouped.map(([, count]) => count);
  const ranks = grouped.map(([rank]) => rank);

  if (flush && top > 0) {
    return { category: "straight flush", ranks: [top], cards };
  }
  if (shape[0] === 4) {
    return { category: "quads", ranks, cards };
  }
  if (shape[0] === 3 && shape[1] === 2) {
    return { category: "full house", ranks, cards };
  }
  if (flush) {
    return { category: "flush", ranks: sorted, cards };
  }
  if (top > 0) {
    return { category: "straight", ranks: [top], cards };
  }
  if (shape[0] === 3) {
    return { category: "trips", ranks, cards };
  }
  if (shape[0] === 2 && shape[1] === 2) {
    return { category: "two pair", ranks, cards };
  }
  if (shape[0] === 2) {
    return { category: "pair", ranks, cards };
  }
  return { category: "high card", ranks: sorted, cards };
}

/**
 * The best five-card hand inside these cards.
 *
 * Seven of them at a showdown — two in the hand and five on the board — and
 * twenty-one ways to pick five, which is few enough to simply try them all.
 * A cleverer evaluator exists and is not worth it here: this runs once per
 * player per hand, and being obviously correct is worth more than being fast
 * at something that happens once a minute.
 */
export function best(cards: Card[]): Score {
  if (cards.length < 5) {
    throw new Error("A poker hand needs five cards to be made from.");
  }
  let winner: Score | null = null;
  for (const picks of choose5(cards.length)) {
    const five = picks.map((at) => cards[at] as Card);
    const score = scoreFive(five);
    if (winner === null || compare(score, winner) > 0) {
      winner = score;
    }
  }
  return winner as Score;
}

/** How a hand reads out loud, for the felt and the hand history. */
export function describe(score: Score): string {
  const name = (value: number): string => {
    const named: Record<number, string> = {
      11: "jacks",
      12: "queens",
      13: "kings",
      14: "aces",
    };
    return named[value] ?? `${value}s`;
  };
  const one = (value: number): Rank => {
    const named: Record<number, Rank> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
    return named[value] ?? (String(value) as Rank);
  };
  const [first = 0, second = 0] = score.ranks;

  switch (score.category) {
    case "straight flush":
      return first === 14 ? "a royal flush" : `a straight flush, ${one(first)} high`;
    case "quads":
      return `four ${name(first)}`;
    case "full house":
      return `${name(first)} full of ${name(second)}`;
    case "flush":
      return `a flush, ${one(first)} high`;
    case "straight":
      return `a straight, ${one(first)} high`;
    case "trips":
      return `three ${name(first)}`;
    case "two pair":
      return `${name(first)} and ${name(second)}`;
    case "pair":
      return `a pair of ${name(first)}`;
    default:
      return `${one(first)} high`;
  }
}
