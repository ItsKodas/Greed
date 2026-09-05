import type { RoomView } from "@greed/shared";
import { Die } from "./Die.js";
import type { RoomActions } from "./useRoom.js";

const fmt = (n: number) => n.toLocaleString("en-US");

interface TableProps {
  room: RoomView;
  seatId: string;
  actions: RoomActions;
}

export function Table({ room, seatId, actions }: TableProps) {
  const turn = room.turn;
  const over = room.status === "over";
  const yours = turn !== null && turn.seatId === seatId && !over;
  const active = room.seats.find((seat) => seat.id === turn?.seatId);

  const canAct = yours && turn.phase === "selecting" && turn.selectionValid;
  const canRollFresh = yours && turn.phase === "awaiting_roll";
  const total = turn === null ? 0 : turn.kept + turn.selection;

  return (
    <div className="table">
      <div className="table__rail">
        {room.seats.map((seat) => {
          const isTurn = seat.id === turn?.seatId && !over;
          const won = over && room.winnerIds.includes(seat.id);
          return (
            <div
              key={seat.id}
              className={`seat${isTurn ? " seat--active" : ""}${won ? " seat--won" : ""}`}
            >
              <div className="seat__avatar">{seat.name.slice(0, 1).toUpperCase()}</div>
              <div className="seat__who">
                <div className="seat__name">
                  {seat.name}
                  {seat.id === seatId ? " (you)" : ""}
                </div>
                <div className="seat__state">
                  {won ? "Winner" : isTurn ? "Rolling" : !seat.connected ? "Gone" : seat.onBoard ? "On the board" : "Not on yet"}
                </div>
              </div>
              <div className="seat__score">{fmt(seat.score)}</div>
            </div>
          );
        })}
      </div>

      <div className="table__main">
        <div className="tray">
          {turn === null || turn.dice.length === 0 ? (
            <p className="tray__empty">
              {over ? "Game over." : yours ? "Your turn — roll to begin." : `Waiting on ${active?.name ?? "the next player"}.`}
            </p>
          ) : (
            <div className="tray__dice">
              {turn.dice.map((face, index) => (
                <Die
                  key={index}
                  face={face}
                  held={turn.held[index] === true}
                  dead={turn.dead[index] === true}
                  interactive={yours && turn.phase === "selecting"}
                  onClick={() => actions.toggle(index)}
                />
              ))}
            </div>
          )}
          <p className="tray__note">
            {turn?.phase === "farkled"
              ? "Farkle — nothing scores. The turn is lost."
              : yours && turn?.phase === "selecting"
                ? turn.selectionValid
                  ? `Worth ${fmt(turn.selection)}. Roll ${turn.nextRollCount} more, or bank ${fmt(total)}.`
                  : turn.held.some(Boolean)
                    ? "That set has a die that scores nothing."
                    : "Click the dice you want to keep."
                : ""}
          </p>
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
            <b>{fmt(turn?.selection ?? 0)}</b>
          </div>
          <div className="stat">
            <span>If you bank</span>
            <b className="stat--good">{fmt(total)}</b>
          </div>
          <div className="stat">
            <span>Bust chance</span>
            <b className="stat--bad">{((turn?.bustChance ?? 0) * 100).toFixed(1)}%</b>
          </div>
        </div>

        {over ? (
          <button type="button" className="btn btn--wide" onClick={actions.leave}>
            Back to the lobby
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--wide"
              disabled={!(canRollFresh || canAct)}
              onClick={actions.roll}
            >
              {canRollFresh ? "Roll 6" : `Roll ${turn?.nextRollCount ?? 6}`}
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
            <span>Table</span>
            <b>{room.code}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
