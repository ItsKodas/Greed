import type { RoomView } from "@greed/shared";
import { useEffect, useRef } from "react";
import { play, unlock } from "./audio.js";

/**
 * Turns changes in room state into sound.
 *
 * Everything is derived from comparing the previous state to the new one
 * rather than from dedicated events, so the sound follows whatever the server
 * says happened — including for the other players at the table.
 */
export function useSound(room: RoomView | null, seatId: string | null): void {
  const previous = useRef<RoomView | null>(null);

  // Browsers will not start audio until the user has touched the page.
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
    previous.current = room;
    if (room === null) {
      return;
    }

    const turn = room.turn;
    const was = before?.turn ?? null;

    if (before !== null && before.status !== "over" && room.status === "over") {
      play("win");
      return;
    }

    if (turn === null) {
      return;
    }

    // New dice on the table.
    const rolled =
      was === null ||
      was.dice.length !== turn.dice.length ||
      was.dice.some((face, index) => face !== turn.dice[index]);
    if (rolled && turn.dice.length > 0) {
      play("roll");
      if (turn.phase === "farkled") {
        window.setTimeout(() => play("farkle"), 320);
      }
      return;
    }

    // Hot dice: the whole set was cleared and six fresh ones came back.
    if (was !== null && turn.kept > was.kept && turn.dice.length === 6 && was.dice.length === 0) {
      play("hotDice");
      return;
    }

    // Someone banked: their turn ended and the table moved on.
    if (was !== null && was.seatId !== turn.seatId) {
      if (before?.turn?.phase !== "farkled") {
        play("bank");
      }
      if (turn.seatId === seatId) {
        window.setTimeout(() => play("yourTurn"), 260);
      }
      return;
    }

    // Dice picked up or put back down.
    if (was !== null && was.dice.length === turn.dice.length) {
      const held = turn.held.filter(Boolean).length;
      const heldBefore = was.held.filter(Boolean).length;
      if (held > heldBefore) {
        play("pick");
      } else if (held < heldBefore) {
        play("drop");
      }
    }
  }, [room, seatId]);
}
