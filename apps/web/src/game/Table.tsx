import { bustProbability, scoreSelection } from "@greed/rules";
import { play } from "./audio.js";
import type { RoomView } from "@greed/shared";
import { SeatAvatar } from "./Avatar.js";
import { useEffect, useState } from "react";
import { Die } from "./Die.js";
import { ScoreCard } from "./ScoreCard.js";
import { ROLL_SETTLE_MS, useRollAnimation } from "./useRollAnimation.js";
import type { PendingRoll } from "./useRollAnimation.js";
import { isScoringStraight } from "./useSound.js";
import type { RoomActions } from "./useRoom.js";

const fmt = (n: number) => n.toLocaleString("en-US");

function greedLine(skin: string): string {
  return skin === "letters" ? "$GREED — one of every face." : "A straight — one of every face.";
}

/** Seconds left on the turn clock, ticking locally off the server's deadline. */
function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (endsAt === null) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

interface TableProps {
  room: RoomView;
  seatId: string;
  actions: RoomActions;
  /** This player's picks, while they are ahead of the server. */
  heldLocally: boolean[] | null;
  /** A throw asked for whose dice have not come back yet. */
  pendingRoll: PendingRoll | null;
}

export function Table({
  room,
  seatId,
  actions,
  heldLocally,
  pendingRoll,
}: TableProps) {
  const turn = room.turn;
  const over = room.status === "over";
  const yours = turn !== null && turn.seatId === seatId && !over;
  const watching = room.watching;
  const active = room.seats.find((seat) => seat.id === turn?.seatId);

  /*
   * Which dice are picked up, and what that is worth.
   *
   * Both are the server's to decide, and both are shown from this player's own
   * clicks until the server's answer arrives — a round trip later. The score is
   * worked out here with the very same function the server runs, from the same
   * rules the room was dealt with, so what is shown early is not a guess and
   * cannot disagree with what follows.
   */
  const held = heldLocally ?? turn?.held ?? [];
  const ahead = heldLocally !== null && turn !== null;
  const localScore = ahead
    ? scoreSelection(
        turn.dice.filter((_, index) => held[index] === true),
        room.ruleset,
      )
    : null;
  const selection = localScore?.points ?? turn?.selection ?? 0;
  const selectionValid = localScore?.valid ?? turn?.selectionValid ?? false;
  const keptCount = held.filter(Boolean).length;
  const nextRollCount = ahead
    ? // Clearing the table earns all six back; that is the hot-dice rule and it
      // is worth showing without waiting to be told.
      turn.dice.length - keptCount === 0
      ? 6
      : turn.dice.length - keptCount
    : (turn?.nextRollCount ?? 0);

  // Cached behind a table keyed on the ruleset, so this costs nothing after
  // the first call and can follow the local count rather than lag behind it.
  const bustChance =
    ahead && nextRollCount >= 1 && nextRollCount <= 6
      ? bustProbability(nextRollCount, room.ruleset)
      : (turn?.bustChance ?? 0);

  const canAct = yours && turn.phase === "selecting" && selectionValid;
  const canRollFresh = yours && turn.phase === "awaiting_roll";
  const total = turn === null ? 0 : turn.kept + selection;
  const left = useCountdown(over ? null : (turn?.endsAt ?? null));
  // One tumble, from the press until the dice land. It owns both halves — the
  // wait for the reply and the throw itself — because handing over between two
  // animations is what made the dice stutter and change count mid-air.
  const { rolling, faces } = useRollAnimation(turn?.dice ?? [], turn?.rollSeq ?? 0, pendingRoll);
  const shown = rolling ? faces : (turn?.dice ?? []);

  // The rarest thing in the game — 720 of the 46,656 six-dice rolls — so it
  // gets a moment of its own once the dice have settled.
  const [celebrating, setCelebrating] = useState(false);
  const greeded = turn !== null && isScoringStraight(turn.dice, room);
  const seq = turn?.rollSeq ?? 0;
  // The celebration belongs to one roll, so it keys on the roll counter
  // rather than on the room.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the roll counter by design
  useEffect(() => {
    if (!greeded) {
      setCelebrating(false);
      return;
    }
    const begin = window.setTimeout(() => setCelebrating(true), ROLL_SETTLE_MS);
    const end = window.setTimeout(() => setCelebrating(false), ROLL_SETTLE_MS + 1800);
    return () => {
      window.clearTimeout(begin);
      window.clearTimeout(end);
    };
  }, [seq, greeded]);

  return (
    <div className="table">
      <div className="table__rail">
        {watching > 0 ? (
          <span className="rail__watching">
            {watching === 1 ? "1 watching" : `${watching} watching`}
          </span>
        ) : null}
        {room.seats.map((seat) => {
          const isTurn = seat.id === turn?.seatId && !over;
          const won = over && room.winnerIds.includes(seat.id);
          return (
            <div
              key={seat.id}
              className={`seat${isTurn ? " seat--active" : ""}${won ? " seat--won" : ""}${seat.waiting ? " seat--waiting" : ""}`}
            >
              <SeatAvatar seat={seat} />
              <div className="seat__who">
                <div className="seat__name">
                  {seat.name}
                  {seat.id === seatId ? " (you)" : ""}
                </div>
                <div className="seat__state">
                  {/* Said plainly, because otherwise a seat that never gets a
                      turn looks like the game has forgotten about them. */}
                  {seat.waiting
                    ? "In the next game"
                    : won
                      ? "Winner"
                      : isTurn
                        ? "Rolling"
                        : !seat.connected
                          ? "Gone"
                          : seat.onBoard
                            ? "On the board"
                            : "Not on yet"}
                </div>
              </div>
              <div className="seat__score">{seat.waiting ? "—" : fmt(seat.score)}</div>
            </div>
          );
        })}
      </div>

      <div className="table__main">
        <div className={`tray${celebrating ? " tray--greed" : ""}`}>
          <div className="tray__stage">
          {!rolling && (turn === null || turn.dice.length === 0) ? (
            <p className="tray__empty">
              {over ? "Game over." : yours ? "Your turn — roll to begin." : `Waiting on ${active?.name ?? "the next player"}.`}
            </p>
          ) : (
            <div className={`tray__dice${rolling ? " tray__dice--rolling" : ""}`}>
              {/*
                * What is on the table: the dice in the air while they are in
                * the air, and the dice that landed once they have. The first
                * throw of a turn has no dice to show yet, so following the
                * turn here would leave the tray empty for the whole throw.
                */}
              {shown.map((face, index) => (
                <Die
                  // A die is its slot. Position is its whole identity — it is what the
                  // server toggles, and dice never reorder except on a fresh roll, where
                  // being treated as the same slots is exactly what the animation needs.
                  // noArrayIndexKey is switched off for this file in biome.json.
                  key={`slot-${index}`}
                  face={face}
                  skin={room.ruleset.skin}
                  held={!rolling && held[index] === true}
                  dead={!rolling && turn?.dead[index] === true}
                  rolling={rolling}
                  index={index}
                  celebrating={celebrating}
                  interactive={!rolling && yours && turn.phase === "selecting"}
                  onClick={() => {
                    // Sounded here rather than off the state that comes back,
                    // so a die answers the finger that moved it. useSound
                    // leaves our own seat's picks alone for this reason.
                    play(held[index] === true ? "drop" : "pick");
                    actions.toggle(index);
                  }}
                />
              ))}
            </div>
          )}
          </div>
          <p className="tray__note">
            {rolling
              ? "Rolling…"
              : celebrating
                ? greedLine(room.ruleset.skin)
                : turn?.phase === "farkled"
              ? "Farkle — nothing scores. The turn is lost."
              : yours && turn?.phase === "selecting"
                ? selectionValid
                  ? `Worth ${fmt(selection)}. Roll ${nextRollCount} more, or bank ${fmt(total)}.`
                  : held.some(Boolean)
                    ? "That set has a die that scores nothing."
                    : "Click the dice you want to keep."
                : ""}
          </p>
          <ScoreCard rules={room.ruleset} />
        </div>
      </div>

      <div className="table__side">
        <div className="panel">
          <p className="panel__label">This turn</p>
          <div className="stat">
            <span>Set aside</span>
            <b>{fmt(turn?.kept ?? 0)}</b>
          </div>
          <div className="stat">
            <span>Selected</span>
            <b>{fmt(selection)}</b>
          </div>
          <div className="stat">
            <span>If you bank</span>
            <b className="stat--good">{fmt(total)}</b>
          </div>
          <div className="stat">
            <span>Bust chance</span>
            <b className="stat--bad">{(bustChance * 100).toFixed(1)}%</b>
          </div>
          {left !== null ? (
            <div className="stat">
              <span>{yours ? "You have" : "They have"}</span>
              <b className={left <= 15 ? "stat--bad" : undefined}>{left}s</b>
            </div>
          ) : null}
        </div>

        {seatId === "" ? (
          // No seat, so no controls — offering buttons that cannot do anything
          // is worse than saying plainly what you are.
          <p className="panel__note">
            You are watching this table. Leave and take a seat to play the next game.
          </p>
        ) : over ? (
          <>
            {/*
              * "Back to the lobby" used to sit here and call leave, which took
              * you out of the table altogether — the label promised the table's
              * own lobby and delivered the front door. Both things exist now,
              * and each says what it does.
              */}
            <button type="button" className="btn btn--wide" onClick={actions.playAgain}>
              Play again
            </button>
            <button type="button" className="btn btn--ghost btn--wide" onClick={actions.leave}>
              Leave the table
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--wide"
              disabled={!(canRollFresh || canAct)}
              onClick={() => {
                play("shake");
                actions.roll(nextRollCount);
              }}
            >
              {/* The count worked out here, not the one last heard from the
                  server — otherwise the button offers six and throws five. */}
              {canRollFresh ? "Roll 6" : `Roll ${nextRollCount}`}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              disabled={!canAct}
              onClick={actions.bank}
            >
              Bank {fmt(total)}
            </button>
          </>
        )}

        <div className="panel panel--tight">
          <div className="stat">
            <span>Target</span>
            <b>{fmt(room.ruleset.targetScore)}</b>
          </div>
          <div className="stat">
            <span>Rules</span>
            <b>{room.ruleset.name}</b>
          </div>
          {room.buyIn > 0 ? (
            <div className="stat">
              <span>Pot</span>
              <b className="stat--good">{fmt(room.pot)}</b>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
