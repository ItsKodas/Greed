import { RULESETS } from "@greed/rules";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getVolume, setVolume, unlock } from "./audio.js";
import { useSound } from "./useSound.js";
import { Table } from "./Table.js";
import { useRoom } from "./useRoom.js";
import type { RoomActions } from "./useRoom.js";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
import type { RoomView } from "@greed/shared";
import "./game.css";

export function Play() {
  const params = useParams();
  const navigate = useNavigate();
  const raw = (params["code"] ?? "").toUpperCase();
  // Only something shaped like a table code gets treated as one; anything else
  // is just a wrong address.
  const looksLikeCode =
    raw.length === CODE_LENGTH && [...raw].every((letter) => CODE_ALPHABET.includes(letter));
  const urlCode = looksLikeCode ? raw : "";
  const { room, seatId, error, connected, busy, actions } = useRoom();
  useSound(room, seatId);

  // The address bar follows the table, so a link can be shared and a refresh
  // lands back in the right place.
  useEffect(() => {
    if (room !== null && room.code !== urlCode) {
      navigate(`/${room.code}`, { replace: true });
    }
  }, [room, urlCode, navigate]);

  if (raw.length > 0 && !looksLikeCode) {
    return <p className="not-found">No table with that code.</p>;
  }

  return (
    <main className="play">
      <header className="play__head">
        <h1 className="play__mark">
          GRE<em>E</em>D
        </h1>
        {room !== null ? <span className="play__code">{room.code}</span> : null}
        {room !== null ? <LeaveButton room={room} onLeave={actions.leave} /> : null}
        <Volume />
        <span className={`play__link${connected ? " play__link--up" : ""}`}>
          {connected ? "connected" : "offline"}
        </span>
      </header>

      {error !== null ? <p className="play__error">{error}</p> : null}
      {room?.lastEvent != null && room.status !== "lobby" ? (
        <p className="play__event">{room.lastEvent}</p>
      ) : null}

      {room === null ? (
        <Join actions={actions} busy={busy} connected={connected} invited={urlCode} />
      ) : room.status === "lobby" ? (
        <Lobby room={room} seatId={seatId} actions={actions} />
      ) : (
        <Table room={room} seatId={seatId ?? ""} actions={actions} />
      )}
    </main>
  );
}

/**
 * Leaving mid-game forfeits the turn, so a running game asks twice. In the
 * lobby there is nothing to lose, so one click is enough.
 */
function LeaveButton({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const [arming, setArming] = useState(false);
  const risky = room.status === "playing";

  useEffect(() => {
    if (!arming) {
      return;
    }
    const timer = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(timer);
  }, [arming]);

  return (
    <button
      type="button"
      className={`btn btn--ghost btn--small${arming ? " btn--warn" : ""}`}
      onClick={() => {
        if (!risky || arming) {
          onLeave();
          return;
        }
        setArming(true);
      }}
    >
      {arming ? "Leave — sure?" : "Leave table"}
    </button>
  );
}

function Volume() {
  const [level, setLevel] = useState(() => getVolume());
  return (
    <label className="volume">
      <span className="volume__icon" aria-hidden="true">
        {level === 0 ? "✕" : "♪"}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={level}
        aria-label="Volume"
        onChange={(event) => {
          const next = Number(event.target.value);
          unlock();
          setVolume(next);
          setLevel(next);
        }}
      />
    </label>
  );
}

function Join({
  actions,
  busy,
  connected,
  invited,
}: {
  actions: RoomActions;
  busy: boolean;
  connected: boolean;
  /** A table code from the address bar, when someone followed a link. */
  invited: string;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(invited);
  const [ruleset, setRuleset] = useState(RULESETS[0]?.name ?? "Classic");
  const ready = name.trim().length > 0 && connected && !busy;

  if (invited.length > 0) {
    return (
      <div className="join">
        <p className="join__pitch">
          You have been invited to table <strong>{invited}</strong>. Put in a name and sit down.
        </p>
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="field__input"
            value={name}
            maxLength={20}
            placeholder="Ada"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready) {
                actions.join(name, invited);
              }
            }}
          />
        </label>
        <div className="join__invited">
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() => actions.join(name, invited)}
          >
            Take a seat
          </button>
        </div>
        {!connected ? <p className="join__warn">Waiting for the server…</p> : null}
      </div>
    );
  }

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

          <div className="variants" role="radiogroup" aria-label="Which dice">
            {RULESETS.map((option) => (
              <button
                key={option.name}
                type="button"
                role="radio"
                aria-checked={option.name === ruleset}
                className={`variant${option.name === ruleset ? " variant--on" : ""}`}
                onClick={() => setRuleset(option.name)}
              >
                <span className="variant__name">{option.name}</span>
                <span className="variant__note">
                  {option.skin === "letters"
                    ? "$ G R E E D faces. First to 5,000."
                    : "Ordinary pips. First to 10,000."}
                </span>
              </button>
            ))}
          </div>

          <p className="panel__note">
            You get a five-character code to share. Up to eight players, or start alone to
            practise.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--wide"
            disabled={!ready}
            onClick={() => actions.create(name, ruleset)}
          >
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
          onClick={() =>
            void navigator.clipboard?.writeText(`${window.location.origin}/${room.code}`)
          }
        >
          Copy link
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
                <div className="seat__state">
                  {seat.isBot ? "Bot" : seat.isHost ? "Host" : "Ready"}
                </div>
              </div>
              {you?.isHost === true && seat.id !== seatId ? (
                <button
                  type="button"
                  className="seat__drop"
                  aria-label={`Remove ${seat.name}`}
                  onClick={() => actions.removeSeat(seat.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {you?.isHost === true ? (
          <>
            <div className="bots">
              <span className="bots__label">Add an opponent</span>
              <div className="bots__row">
                {(["easy", "normal", "hard"] as const).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => actions.addBot(skill)}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn btn--wide" onClick={actions.start}>
              {solo ? "Practise on your own" : "Deal the first turn"}
            </button>
          </>
        ) : (
          <p className="panel__note">Waiting for the host to start.</p>
        )}
      </div>
    </div>
  );
}
