import type { Card as CardData, Rank, Suit } from "@backroom/game-blackjack";
import { useId } from "react";
import {
  CARD_H,
  CARD_R,
  CARD_W,
  COURT_EMBLEM,
  COURT_PANEL,
  INDEX,
  isCourt,
  isRed,
  PIP_SCALE,
  pipsFor,
  SUIT_PATH,
} from "./deck.js";

/**
 * The deck.
 *
 * Drawn rather than set in type. A card is a layout — an index in two corners
 * and a field of pips between them — and the whole point of the traditional
 * arrangement is that it is the same on every card, which is a thing you get
 * from geometry and not from a font. It also means one card is one shape at
 * any size, which is what makes the felt animate later without a sprite sheet
 * to keep in step.
 *
 * Every number here lives in {@link deck.ts}, in the 100×140 box a real card
 * is shaped like. Nothing in this file nudges anything.
 */

/** The corner index: rank over suit, drawn at one corner and again at the other. */
function Index({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <g>
      {/* Centred on the index column rather than left-aligned, so a "10" and
          an "A" sit over the same axis instead of drifting apart. */}
      <text
        className="bj-card__rank"
        x={INDEX.x}
        y={INDEX.rankBase}
        textAnchor="middle"
        // Ten is the only two-character rank, and at full size it would spill
        // out of the index column. Squeezed rather than shrunk, so it keeps
        // the height of every other rank and the corner still reads as a row.
        textLength={rank === "10" ? 19 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {rank}
      </text>
      <path
        d={SUIT_PATH[suit]}
        transform={`translate(${INDEX.x} ${INDEX.suitY}) scale(${INDEX.suitScale})`}
      />
    </g>
  );
}

/**
 * One card, face up.
 *
 * Red and black rather than four colours: a deck is two colours, and somebody
 * reading a hand at a glance is reading rank first and suit second.
 */
export function Card({ card }: { card: CardData }) {
  const red = isRed(card.suit);
  const pips = pipsFor(card.rank);
  const court = isCourt(card.rank);
  const emblem = COURT_EMBLEM[card.rank];

  return (
    <svg
      className={`bj-card${red ? " bj-card--red" : ""}`}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <rect
        className="bj-card__face"
        x="0.5"
        y="0.5"
        width={CARD_W - 1}
        height={CARD_H - 1}
        rx={CARD_R}
      />
      <g className="bj-card__ink" fill="currentColor">
        <Index rank={card.rank} suit={card.suit} />
        {/* The second index is the first one turned about the middle of the
            card — which is what makes it land in the opposite corner at the
            opposite angle without a second set of numbers to keep in step. */}
        <g transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2})`}>
          <Index rank={card.rank} suit={card.suit} />
        </g>

        {court && emblem !== undefined ? (
          <>
            <rect
              className="bj-card__panel"
              x={COURT_PANEL.x}
              y={COURT_PANEL.y}
              width={COURT_PANEL.w}
              height={COURT_PANEL.h}
              rx="3"
            />
            {/* Divided across the middle and mirrored about it, which is what
                a real court card is: one figure, and the same figure upside
                down, so the card reads the same whichever way it is held. */}
            <path
              className="bj-card__rule"
              d={`M${COURT_PANEL.x} ${COURT_PANEL.mid} H${COURT_PANEL.x + COURT_PANEL.w}`}
            />
            <path d={emblem} transform={`translate(50 ${COURT_PANEL.emblemY})`} />
            <path
              d={emblem}
              transform={`rotate(180 50 ${COURT_PANEL.mid}) translate(50 ${COURT_PANEL.emblemY})`}
            />
          </>
        ) : (
          pips.map((pip) => (
            <path
              key={`${pip.x}-${pip.y}`}
              d={SUIT_PATH[card.suit]}
              transform={`translate(${pip.x} ${pip.y}) rotate(${pip.turned ? 180 : 0}) scale(${
                pip.big === true ? PIP_SCALE.ace : PIP_SCALE.normal
              })`}
            />
          ))
        )}
      </g>
    </svg>
  );
}

/**
 * A card whose face nobody has been told.
 *
 * There is nothing behind this in the payload — the server left the card out
 * rather than sending it and asking the browser to keep the secret.
 *
 * The weave takes its colours from the page rather than from here, so a game
 * with its own theme deals its own deck without a second drawing of one.
 */
export function FaceDown() {
  // A pattern needs an id unique to the document, and a felt can hold several
  // face-down cards at once.
  const weave = useId();

  return (
    <svg
      className="bj-card bj-card--down"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role="img"
      aria-label="face down"
    >
      <defs>
        {/* Eight units, which is a compromise the small size wins: finer and
            the weave greys out at the forty-seven pixels a card is actually
            dealt at, coarser and it reads as three fat stripes up close. */}
        <pattern
          id={weave}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" className="bj-card__weft" />
          <rect width="3.7" height="8" className="bj-card__warp" />
        </pattern>
      </defs>
      <rect
        className="bj-card__back"
        x="0.5"
        y="0.5"
        width={CARD_W - 1}
        height={CARD_H - 1}
        rx={CARD_R}
      />
      {/* Inset, so the weave has a border of its own the way a printed back
          does — a pattern running to the edge reads as a swatch, not a card. */}
      <rect x="6" y="6" width={CARD_W - 12} height={CARD_H - 12} rx="4" fill={`url(#${weave})`} />
      <rect
        className="bj-card__edge"
        x="6"
        y="6"
        width={CARD_W - 12}
        height={CARD_H - 12}
        rx="4"
      />
    </svg>
  );
}

export function Hand({ cards, hidden }: { cards: readonly CardData[]; hidden?: boolean }) {
  /*
   * Four cards is where a hand stops fitting beside a seat.
   *
   * Up to three it is laid out flat, which is the clearest way to read one.
   * Past that the row is wider than the seat holding it, and what got pushed
   * out was the count — into the next player's seat. So a long hand is dealt
   * onto itself instead, the way one actually sits in a hand on a felt. The
   * index is in the corner either way, so an overlapped card still says what
   * it is.
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
