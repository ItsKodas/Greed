import type { Card, Rank } from "./cards.js";

const TEN: Rank[] = ["10", "J", "Q", "K"];

/** What a rank is worth, counting every ace as one. */
function low(rank: Rank): number {
  if (rank === "A") {
    return 1;
  }
  return TEN.includes(rank) ? 10 : Number(rank);
}

export interface HandValue {
  /** The best total that is not bust, or the lowest total if every one is. */
  total: number;
  /** True when an ace is being counted as eleven and could still be dropped. */
  soft: boolean;
  bust: boolean;
}

/**
 * What a hand is worth.
 *
 * Aces are the whole difficulty: each is one or eleven, but only one of them
 * can ever be eleven without busting, so the hand is counted low and promoted
 * once if there is room. That is simpler than it sounds and avoids the usual
 * bug of counting two aces as twenty-two.
 */
export function value(cards: readonly Card[]): HandValue {
  const total = cards.reduce((sum, card) => sum + low(card.rank), 0);
  const hasAce = cards.some((card) => card.rank === "A");
  if (hasAce && total + 10 <= 21) {
    return { total: total + 10, soft: true, bust: false };
  }
  return { total, soft: false, bust: total > 21 };
}

/** Twenty-one on the first two cards, which pays more than a plain twenty-one. */
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && value(cards).total === 21;
}
