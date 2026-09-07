import type { Card as CardData, Rank, Suit } from "@backroom/game-blackjack";
import type { PointerEvent } from "react";
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

/**
 * Angles a card toward the pointer.
 *
 * Written straight onto the element rather than held in state on purpose: this
 * fires on every pointer move, and a re-render per move would be a re-render
 * of the whole felt sixty times a second to move one card a few degrees.
 */
const tilt = {
  onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    // Where the pointer is on the card, from its middle: -0.5 to 0.5 each way.
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    // Toward the pointer, so the near edge dips. Reading the other way round
    // makes a card that leans away from your finger, which feels wrong before
    // anybody works out why.
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 20).toFixed(1)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 24).toFixed(1)}deg`);
  },
  onPointerLeave(event: PointerEvent<SVGSVGElement>) {
    // Back to flat, and let the transition carry it there.
    event.currentTarget.style.removeProperty("--tilt-x");
    event.currentTarget.style.removeProperty("--tilt-y");
  },
};

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
export function Card({
  card,
  deal = 0,
  turned = false,
}: {
  card: CardData;
  /**
   * Which card of the deal this is, for the stagger.
   *
   * Only the opening two are staggered. A card taken later arrives on its own
   * and waiting a beat before showing it would read as lag, which is the exact
   * thing the rest of this is here to avoid.
   */
  deal?: number;
  /** Turned over rather than dealt in — the hole card, and only that. */
  turned?: boolean;
}) {
  const red = isRed(card.suit);
  const pips = pipsFor(card.rank);
  const court = isCourt(card.rank);
  const emblem = COURT_EMBLEM[card.rank];

  return (
    <svg
      className={`bj-card${red ? " bj-card--red" : ""} ${turned ? "bj-card--turning" : "bj-card--dealing"}`}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
      {...tilt}
      // A card is only ever dealt once, so this runs on mount and never again
      // — which is precisely the behaviour wanted, and why the stagger can be
      // a plain delay rather than something choreographed.
      style={deal > 0 ? { animationDelay: `${deal * 90}ms` } : undefined}
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
export function FaceDown({ arriving = false }: { arriving?: boolean }) {
  // A pattern needs an id unique to the document, and a felt can hold several
  // face-down cards at once.
  const weave = useId();

  return (
    <svg
      className={`bj-card bj-card--down${arriving ? " bj-card--arriving" : " bj-card--dealing"}`}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role="img"
      aria-label="face down"
      {...tilt}
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

export function Hand({
  cards,
  hidden,
  arriving = false,
  turnedFrom,
}: {
  cards: readonly CardData[];
  hidden?: boolean;
  /**
   * A card this player has asked for and the table has not sent yet.
   *
   * Shown face down, because that is the honest version: a card is on its way
   * and nobody knows what it is. It is the only thing on the felt that is not
   * the table's word, and it is replaced the moment the table speaks.
   */
  arriving?: boolean;
  /** From this card on, the hand is being turned over rather than dealt. */
  turnedFrom?: number;
}) {
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
        <Card
          // biome-ignore lint/suspicious/noArrayIndexKey: a hand is append-only
          key={index}
          card={card}
          deal={index}
          turned={turnedFrom !== undefined && index >= turnedFrom}
        />
      ))}
      {hidden === true ? <FaceDown /> : null}
      {arriving ? <FaceDown arriving /> : null}
    </span>
  );
}
