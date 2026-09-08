import type { TableView } from "@backroom/game-poker";
import { useEffect, useRef } from "react";
import { play, preload, unlock } from "../game/audio.js";

/**
 * Turns changes at a poker table into sound.
 *
 * Its own rather than blackjack's, which reads `seat.hands` and a dealer —
 * neither of which a poker seat has. Derived from comparing states the same
 * way, though, and for the same reason: a table sounds for everybody's cards
 * and not only your own, which is most of what makes it feel occupied.
 */

/** What everybody has put in this street, which is what a chip sound is for. */
const onFelt = (view: TableView): number =>
  view.seats.reduce((total, seat) => total + seat.committed, 0);

export function useTableSound(view: TableView | null, seatId: string | null): void {
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
     * At most one card sound per update, in the order of what matters. A hand
     * going out is one sound rather than one per card, because that is how it
     * reads to somebody sitting at the table.
     */
    if (before.street === "waiting" && view.street === "preflop") {
      play("deal");
    } else if (view.street === "showdown" && before.street !== "showdown") {
      play("reveal");
    } else if (view.board.length > before.board.length) {
      play("card");
    } else if (onFelt(view) > onFelt(before)) {
      // Somebody put chips in. Deliberately after the card sounds and not
      // instead of them: a street turns over and the betting starts again in
      // the same update, and the card is the thing that just happened.
      play("bet");
    }

    /*
     * Being paid is not exclusive with any of the above — a hand is turned
     * over and won in one update, and a return here would swallow the sound
     * of winning it.
     */
    const mine = view.paid.find((one) => one.seatId === seatId);
    const had = before.paid.find((one) => one.seatId === seatId);
    if (mine !== undefined && had === undefined) {
      window.setTimeout(() => play("payout"), 380);
    }
  }, [view, seatId]);
}
