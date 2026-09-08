import { useState } from "react";
/*
 * The deck's own card, so the mockup shows the cards the building actually
 * deals rather than a drawing of some. Poker's own deck is a different list —
 * two low, ace high, no soft ace — but a card is a rank and a suit either way,
 * and this is what the felt will be built on.
 */
import type { Card as CardData } from "@backroom/game-blackjack";
import { Card, FaceDown } from "../blackjack/Cards.js";

/**
 * A poker table, before there is one.
 *
 * A mockup and nothing else: no server, no rules, no chips that exist. It is
 * here to answer the questions the engine cannot, and which are much harder to
 * change once a felt is built on top of them — where ten seats go, what a seat
 * looks like when it has folded, and whether any of it survives a phone.
 *
 * Ten is the case to design for and the one a six-handed sketch would flatter.
 * The seats go round an ellipse rather than a circle because a table is wider
 * than it is tall, and the player's own seat is pinned to the bottom middle:
 * every other seat is somebody you are looking at, and yours is the one you
 * are looking from.
 */

/** How the deck writes a card; the mockup deals a few by hand. */
const card = (text: string): CardData => {
  const suits = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;
  return {
    rank: text.slice(0, -1) as CardData["rank"],
    suit: suits[text.slice(-1) as keyof typeof suits],
  };
};

type SeatState = "waiting" | "acting" | "folded" | "allIn" | "won";

interface MockSeat {
  name: string;
  stack: number;
  bet: number;
  state: SeatState;
  /**
   * The button, or a blind this seat is posting.
   *
   * Worth drawing even in a mockup: the button is what tells a player whose
   * turn comes first and how the next hand will shift, and a felt without one
   * is a felt where the order of play is a mystery.
   */
  mark?: "D" | "SB" | "BB";
  /** Shown face up only at a showdown, or when it is your own seat. */
  hole?: [CardData, CardData];
  says?: string;
}

/**
 * Where a seat sits, as a percentage of the felt.
 *
 * Counted from the bottom middle and going clockwise, so seat one is always
 * you and the rest fill round the table in the order a dealer would deal them.
 * An ellipse rather than a circle: a felt is wider than it is tall, and seats
 * evenly spaced round a circle would bunch at the ends of it.
 */
function seatAt(index: number, of: number): React.CSSProperties {
  const angle = Math.PI / 2 + (index / of) * Math.PI * 2;
  /*
   * Where round the ring, and nothing about how big the ring is.
   *
   * The radius lives in the stylesheet so a container query can pull the seats
   * in on a narrow felt — a seat is placed by its middle, and a ring that
   * reaches too far across hangs half a seat off each side, which at 375px
   * scrolled the whole page sideways rather than merely looking wrong. React
   * cannot see the container's width; CSS can.
   */
  return {
    "--cos": Math.cos(angle).toFixed(4),
    "--sin": Math.sin(angle).toFixed(4),
  } as React.CSSProperties;
}

/** The felt at a given size, in a given moment of a hand. */
function Table({
  seats,
  board,
  pot,
  side,
}: {
  seats: MockSeat[];
  board: CardData[];
  pot: number;
  side?: number;
}) {
  return (
    <div className="pk">
      <div className="pk__felt">
        <div className="pk__middle">
          <p className="pk__pot">
            <span className="pk__pot-label">Pot</span>
            <strong>{pot.toLocaleString("en-US")}</strong>
            {side === undefined ? null : (
              <span className="pk__side">side {side.toLocaleString("en-US")}</span>
            )}
          </p>
          <div className="pk__board">
            {board.map((one, at) => (
              <Card key={`${one.rank}${one.suit}`} card={one} deal={at} />
            ))}
            {/* The street that has not come yet, so the board keeps its width
                and nothing shuffles sideways when a card lands. */}
            {Array.from({ length: 5 - board.length }, (_, at) => (
              <span className="pk__gap" key={`gap-${at}`} />
            ))}
          </div>
        </div>

        {seats.map((seat, at) => (
          <div
            className={`pk__seat pk__seat--${seat.state}`}
            key={seat.name}
            style={seatAt(at, seats.length)}
          >
            <div className="pk__cards">
              {seat.hole === undefined ? (
                <>
                  <FaceDown />
                  <FaceDown deal={1} />
                </>
              ) : (
                seat.hole.map((one, index) => (
                  <Card key={`${one.rank}${one.suit}`} card={one} deal={index} />
                ))
              )}
            </div>
            <div className="pk__who">
              <span className="pk__name">{seat.name}</span>
              <span className="pk__stack">{seat.stack.toLocaleString("en-US")}</span>
            </div>
            {seat.mark === undefined ? null : (
              <span className={`pk__mark pk__mark--${seat.mark.toLowerCase()}`}>{seat.mark}</span>
            )}
            {seat.bet > 0 ? (
              <span className="pk__bet">{seat.bet.toLocaleString("en-US")}</span>
            ) : null}
            {seat.says === undefined ? null : <span className="pk__says">{seat.says}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the player can do, and the one control that is not a button. */
function Actions() {
  const [raise, setRaise] = useState(300);
  return (
    <div className="pk__actions">
      <button type="button" className="pk__act pk__act--fold">
        Fold
      </button>
      <button type="button" className="pk__act">
        Call 100
      </button>
      <button type="button" className="pk__act pk__act--raise">
        Raise to {raise.toLocaleString("en-US")}
      </button>
      <label className="pk__slider">
        <span className="pk__slider-label">How much</span>
        <input
          type="range"
          min={200}
          max={2400}
          step={50}
          value={raise}
          onChange={(event) => setRaise(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

const YOU: [CardData, CardData] = [card("As"), card("Kd")];

/** Ten seats, mid-hand, with somebody to act. */
const FULL: MockSeat[] = [
  { name: "You", stack: 4_250, bet: 100, state: "acting", hole: YOU },
  { name: "Bo", stack: 8_100, bet: 100, state: "waiting", mark: "D" },
  { name: "Cass", stack: 0, bet: 2_400, state: "allIn", says: "all in" },
  { name: "Dev", stack: 3_300, bet: 0, state: "folded", mark: "SB" },
  { name: "Eli", stack: 12_400, bet: 100, state: "waiting", mark: "BB" },
  { name: "Fern", stack: 900, bet: 0, state: "folded" },
  { name: "Gus", stack: 5_600, bet: 100, state: "waiting" },
  { name: "Hana", stack: 2_050, bet: 0, state: "folded" },
  { name: "Ira", stack: 7_700, bet: 100, state: "waiting" },
  { name: "Jo", stack: 1_400, bet: 0, state: "folded" },
];

const SIX: MockSeat[] = FULL.slice(0, 6);

const HEADS_UP: MockSeat[] = [
  { name: "You", stack: 6_000, bet: 400, state: "won", hole: YOU, says: "two pair" },
  { name: "Bo", stack: 3_600, bet: 400, state: "waiting", hole: [card("Qh"), card("Qc")], mark: "D" },
];

const BOARD = [card("Ah"), card("Kc"), card("7d"), card("2s"), card("9h")];

export function PokerMockup() {
  const [seats, setSeats] = useState(10);
  const [street, setStreet] = useState(3);

  const at = seats === 2 ? HEADS_UP : seats === 6 ? SIX : FULL;
  const board = BOARD.slice(0, street);

  return (
    <section className="gallery__section" data-game="poker">
      <h2 className="gallery__heading">The felt</h2>
      <p className="gallery__note">
        A table before there is one. Nothing here is wired to anything — no rules, no server, no
        chips that exist. It is here to settle the parts the engine cannot: where ten seats go,
        what a seat looks like once it has folded, and whether any of it survives a phone.
      </p>

      <div className="mock__row">
        <div className="picker" role="radiogroup" aria-label="How many at the table">
          <span className="picker__label">Seats</span>
          <div className="picker__row">
            {[2, 6, 10].map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={seats === count}
                className={`picker__pick${seats === count ? " picker__pick--on" : ""}`}
                onClick={() => setSeats(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="picker" role="radiogroup" aria-label="Which street">
          <span className="picker__label">Board</span>
          <div className="picker__row">
            {[
              [0, "Preflop"],
              [3, "Flop"],
              [4, "Turn"],
              [5, "River"],
            ].map(([count, name]) => (
              <button
                key={name as string}
                type="button"
                role="radio"
                aria-checked={street === count}
                className={`picker__pick${street === count ? " picker__pick--on" : ""}`}
                onClick={() => setStreet(count as number)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Table seats={at} board={board} pot={2_900} {...(seats === 10 ? { side: 1_200 } : {})} />
      <Actions />

      <p className="gallery__note">
        Your seat is pinned to the bottom, because every other seat is somebody you are looking at
        and yours is the one you are looking from. A folded seat keeps its chair and loses its
        cards — it has to still be there, or a table would appear to empty out every hand.
      </p>
    </section>
  );
}
