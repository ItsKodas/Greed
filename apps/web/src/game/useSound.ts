import type { RoomView } from "@backroom/shared";
import { useEffect, useRef } from "react";
import { play, preload, unlock } from "./audio.js";
import { ROLL_SETTLE_MS } from "./useRollAnimation.js";

/**
 * One of every face, in a game where that actually pays. The celebration is a
 * display concern, so it is read off the dice rather than given its own field
 * in the protocol — but it still checks the ruleset, because a straight is
 * worth nothing under rules that do not have one.
 */
export function isScoringStraight(dice: readonly number[], room: RoomView): boolean {
  const straight = room.ruleset.straight;
  if (straight === null || straight <= 0) {
    return false;
  }
  return dice.length === 6 && new Set(dice).size === 6;
}

/**
 * Turns changes in room state into sound.
 *
 * Everything is derived from comparing the previous state to the new one
 * rather than from dedicated events, so the sound follows whatever the server
 * says happened — including for the other players at the table.
 */
export function useSound(room: RoomView | null, seatId: string | null): void {
  const previous = useRef<RoomView | null>(null);

  // Browsers will not start audio until the user has touched the page — but
  // nothing stops us fetching the files before then, which is most of the wait
  // when the server is far away.
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
    previous.current = room;
    if (room === null) {
      return;
    }

    const turn = room.turn;
    const was = before?.turn ?? null;
    /*
     * Whether the change we are looking at is this player's own doing.
     *
     * Their picks and their rolls are sounded the moment they click, because
     * waiting for the state to come back is the very delay this avoids. Only
     * one of the two may speak, so the state-driven cue stands aside for the
     * seat that is playing and still speaks for everyone else at the table.
     */
    const ours = turn !== null && turn.seatId === seatId;

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
      if (!ours) {
        play("shake");
      }
      window.setTimeout(() => play("land"), ROLL_SETTLE_MS);
      if (turn.phase === "farkled") {
        window.setTimeout(() => play("farkle"), ROLL_SETTLE_MS + 260);
      } else if (isScoringStraight(turn.dice, room)) {
        window.setTimeout(() => play("greed"), ROLL_SETTLE_MS + 60);
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

    // Dice picked up or put back down — someone else's; ours already sounded.
    if (!ours && was !== null && was.dice.length === turn.dice.length) {
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
