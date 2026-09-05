import { useState } from "react";
import { Table } from "./Table.js";
import { useRoom } from "./useRoom.js";
import type { RoomActions } from "./useRoom.js";
import type { RoomView } from "@greed/shared";
import "./game.css";

export function Play() {
  const { room, seatId, error, connected, busy, actions } = useRoom();

  return (
    <main className="play">
      <header className="play__head">
        <h1 className="play__mark">
          GRE<em>E</em>D
        </h1>
        {room !== null ? <span className="play__code">{room.code}</span> : null}
        <span className={`play__link${connected ? " play__link--up" : ""}`}>
          {connected ? "connected" : "offline"}
        </span>
      </header>

      {error !== null ? <p className="play__error">{error}</p> : null}
      {room?.lastEvent != null && room.status !== "lobby" ? (
        <p className="play__event">{room.lastEvent}</p>
      ) : null}

      {room === null ? (
        <Join actions={actions} busy={busy} connected={connected} />
      ) : room.status === "lobby" ? (
        <Lobby room={room} seatId={seatId} actions={actions} />
      ) : (
        <Table room={room} seatId={seatId ?? ""} actions={actions} />
      )}
    </main>
  );
}

function Join({ actions, busy, connected }: { actions: RoomActions; busy: boolean; connected: boolean }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const ready = name.trim().length > 0 && connected && !busy;

  return (
    <div className="join">
      <p className="join__pitch">
        Roll six dice. Set aside what scores. Roll again for more, or bank it and pass the cup — but
        roll nothing scoring and you lose the lot.
      </p>

      <label className="field">
        <span className="field__label">Your name</span>
        <input
          className="field__input"
          value={name}
          maxLength={20}
          placeholder="Ada"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="join__split">
        <div className="panel">
          <p className="panel__label">Join a table</p>
          <input
            className="field__input field__input--code"
            value={code}
            maxLength={5}
            placeholder="X7KQ3"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready && code.length === 5) {
                actions.join(name, code);
              }
            }}
          />
          <button
            type="button"
            className="btn btn--wide"
            disabled={!ready || code.length !== 5}
            onClick={() => actions.join(name, code)}
          >
            Take a seat
          </button>
        </div>

        <div className="panel">
          <p className="panel__label">Open your own</p>
          <p className="panel__note">
            You get a five-character code to share. Up to eight players, or start alone to practise. First to 10,000 wins.
          </p>
          <button type="button" className="btn btn--ghost btn--wide" disabled={!ready} onClick={() => actions.create(name)}>
            Open a table
          </button>
        </div>
      </div>

      {!connected ? <p className="join__warn">Waiting for the server…</p> : null}
    </div>
  );
}

function Lobby({ room, seatId, actions }: { room: RoomView; seatId: string | null; actions: RoomActions }) {
  const you = room.seats.find((seat) => seat.id === seatId);
  const solo = room.seats.length === 1;

  return (
    <div className="lobby">
      <div>
        <p className="panel__label">Share this code</p>
        <div className="lobby__code">{room.code}</div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => void navigator.clipboard?.writeText(room.code)}
        >
          Copy code
        </button>
      </div>

      <div>
        <p className="panel__label">
          Seated · {room.seats.length} of 8
        </p>
        <div className="lobby__seats">
          {room.seats.map((seat) => (
            <div className="seat" key={seat.id}>
              <div className="seat__avatar">{seat.name.slice(0, 1).toUpperCase()}</div>
              <div className="seat__who">
                <div className="seat__name">
                  {seat.name}
                  {seat.id === seatId ? " (you)" : ""}
                </div>
                <div className="seat__state">{seat.isHost ? "Host" : "Ready"}</div>
              </div>
            </div>
          ))}
        </div>

        {you?.isHost === true ? (
          <button type="button" className="btn btn--wide" onClick={actions.start}>
            {solo ? "Practise on your own" : "Deal the first turn"}
          </button>
        ) : (
          <p className="panel__note">Waiting for the host to start.</p>
        )}
      </div>
    </div>
  );
}
