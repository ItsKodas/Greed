import type { Card as CardData, Suit } from "@backroom/game-blackjack";

const PIPS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/**
 * One card, face up.
 *
 * Red and black rather than four colours: a deck is two colours and a player
 * reading a hand at a glance is reading rank first, suit second.
 */
export function Card({ card }: { card: CardData }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span
      className={`bj-card${red ? " bj-card--red" : ""}`}
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className="bj-card__rank">{card.rank}</span>
      <span className="bj-card__pip" aria-hidden="true">
        {PIPS[card.suit]}
      </span>
    </span>
  );
}

/**
 * A card whose face nobody has been told.
 *
 * There is nothing behind this in the payload — the server left the card out
 * rather than sending it and asking the browser to keep the secret.
 */
export function FaceDown() {
  return <span className="bj-card bj-card--down" role="img" aria-label="face down" />;
}

export function Hand({ cards, hidden }: { cards: readonly CardData[]; hidden?: boolean }) {
  /*
   * Four cards is where a hand stops fitting beside a seat.
   *
   * Up to three it is laid out flat, which is the clearest way to read one.
   * Past that the row is wider than the seat holding it, and what got pushed
   * out was the count — into the next player's seat. So a long hand is dealt
   * onto itself instead, the way one actually sits in a hand on a felt.
   */
  const tight = cards.length + (hidden === true ? 1 : 0) > 3;
  return (
    <span className={`bj-hand${tight ? " bj-hand--tight" : ""}`}>
      {cards.map((card, index) => (
        /*
         * Position is the identity here. A hand only ever grows at its end,
         * and a four-deck shoe deals the same card to the same hand often
         * enough that rank and suit are not unique — so keying by what the
         * card is would collide where keying by where it sits cannot.
         */
        // biome-ignore lint/suspicious/noArrayIndexKey: a hand is append-only
        <Card key={index} card={card} />
      ))}
      {hidden === true ? <FaceDown /> : null}
    </span>
  );
}
