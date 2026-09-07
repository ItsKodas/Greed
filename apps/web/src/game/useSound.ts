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
 * Whether anybody's score went up between two states — that is, whether
 * somebody banked.
 *
 * Extracted because getting this wrong is silent. The first version asked
 * whether the turn had moved to another seat, which is true almost always and
 * false in exactly the cases nobody tests by hand: a table of one, or a table
 * where everyone else is disconnected or waiting. `(0 + 1) % 1` is zero, so
 * the turn came back to the same seat and the chips never sounded.
 */
export function someoneBanked(before: RoomView | null, now: RoomView): boolean {
  if (before === null) {
    return false;
  }
  return now.seats.some((seat) => {
    const then = before.seats.find((other) => other.id === seat.id);
    return then !== undefined && seat.score > then.score;
  });
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
      // Chips counted out under the fanfare, but only for somebody who is
      // actually being paid and only when there was a pot to pay from.
      if (room.pot > 0 && seatId !== null && room.winnerIds.includes(seatId)) {
        window.setTimeout(() => play("payout"), 520);
      }
      return;
    }

    // The stake going on the table, which is a lobby change everyone hears.
    if (before !== null && room.buyIn > before.buyIn) {
      play("bet");
    }

    /*
     * Somebody banked, read from a score going up rather than from the turn
     * moving on to somebody else.
     *
     * The turn moving was the wrong signal. At a table of one — practising
     * alone, which is a whole mode — advanceTurn steps `(0 + 1) % 1` and lands
     * back on the same seat, so the turn never "moves" and the chips never
     * sounded. The same silence hit any table where everyone else happened to
     * be disconnected or waiting for the next game.
     *
     * A score is also the truer signal: banking is the act of a score going
     * up, whether the turn passes afterwards or not, and a farkle cannot fake
     * it — which is why the farkle guard this used to need has gone.
     */
    if (someoneBanked(before, room)) {
      play("bank");
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

    // The table moved on to somebody else. The chips were sounded above; this
    // is only the bell for whoever it moved on to.
    if (was !== null && was.seatId !== turn.seatId) {
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
