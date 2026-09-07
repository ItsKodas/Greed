import type { TableView } from "@backroom/game-blackjack";
import { useEffect, useRef } from "react";
import { play, preload, unlock } from "../game/audio.js";

/** How many cards are on the table, across every hand and the dealer's. */
function cardsOut(view: TableView): number {
  return view.seats.reduce(
    (total, seat) => total + seat.hands.reduce((cards, hand) => cards + hand.cards.length, 0),
    view.dealer.cards.length,
  );
}

/** Everything a seat got back, across however many hands it played. */
function paid(seat: TableView["seats"][number]): number {
  return seat.hands.reduce((total, hand) => total + hand.returned, 0);
}

/**
 * Turns changes at a blackjack table into sound.
 *
 * Derived from comparing states rather than from events, the same way Greed's
 * is, so the table sounds for everybody's cards and not only your own — which
 * is most of what makes a table feel occupied.
 */
export function useCardSound(view: TableView | null, seatId: string | null): void {
  const previous = useRef<TableView | null>(null);

  // Fetching needs nothing from the browser; playing does. So the files are
  // pulled straight away and the context waits for a touch.
  useEffect(() => {
    void preload();
  }, []);

  useEffect(() => {
    const wake = () => unlock();
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (view === null || before === null) {
      return;
    }

    /*
     * At most one card sound per update, in order of what matters. These are
     * exclusive of each other but deliberately not of the payout below: the
     * hole card turns and the hand settles in the very same update, so a
     * return here would have swallowed the sound of being paid.
     */
    if (before.phase === "betting" && view.phase === "playing") {
      // One sound for the whole deal rather than one per card, because that
      // is how it reads to somebody sitting at the table.
      play("deal");
    } else if (before.dealer.hidden && !view.dealer.hidden) {
      // The hole card, turned. Taken ahead of the card count because the
      // dealer's own draws arrive alongside it and the turn is the part worth
      // hearing — the rest of the hand rides in behind it.
      play("reveal");
    } else if (view.phase === "playing" && cardsOut(view) > cardsOut(before)) {
      // Somebody took a card — theirs or yours, one sound either way.
      play("card");
    }

    if (before.phase !== "settled" && view.phase === "settled") {
      const me = view.seats.find((seat) => seat.id === seatId);
      // Only on the way in. A loss is silence, which is both quieter to sit
      // through and truer to what a table sounds like when you have lost.
      // Up on the deal as a whole: a split that wins one and loses the other
      // by more is not a payout, whatever the winning hand says on its own.
      if (me !== undefined && paid(me) > me.bet) {
        window.setTimeout(() => play("payout"), 380);
      }
    }
  }, [view, seatId]);
}
