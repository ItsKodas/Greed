import type { RoomView } from "@greed/shared";
import { useEffect, useRef } from "react";
import { play, unlock } from "./audio.js";
import { ROLL_SETTLE_MS } from "./useRollAnimation.js";

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

    // A new throw. Keyed on the counter, not the faces, so rolling the same
    // thing twice running still makes a noise.
    if (turn.rollSeq > 0 && turn.rollSeq !== (was?.rollSeq ?? 0) && turn.dice.length > 0) {
      play("shake");
      window.setTimeout(() => play("land"), ROLL_SETTLE_MS);
      if (turn.phase === "farkled") {
        window.setTimeout(() => play("farkle"), ROLL_SETTLE_MS + 260);
      } else if (was !== null && turn.kept > was.kept && turn.dice.length === 6) {
        window.setTimeout(() => play("hotDice"), ROLL_SETTLE_MS + 120);
      }
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
