import { RULESETS } from "@greed/rules";
import { Avatar, SeatAvatar } from "./Avatar.js";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getVolume, setVolume, unlock } from "./audio.js";
import { useSound } from "./useSound.js";
import { Chat } from "./Chat.js";
import { HouseRulesEditor } from "./HouseRulesEditor.js";
import { Table } from "./Table.js";
import { useAccount } from "./useAccount.js";
import type { Account } from "./useAccount.js";
import { useRoom } from "./useRoom.js";
import type { RoomActions } from "./useRoom.js";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
import type { ChatMessage } from "@greed/shared";
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
  const { room, heldLocally, pendingRoll, chat, seatId, error, connected, busy, actions } =
    useRoom();
  const account = useAccount();
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
        <AccountBadge account={account} />
        <Volume />
        <span className={`play__link${connected ? " play__link--up" : ""}`}>
          {connected ? "connected" : "offline"}
        </span>
      </header>

      {error !== null ? <p className="play__error">{error}</p> : null}
      {account.dailyMessage !== null ? (
        <p className="play__event">{account.dailyMessage}</p>
      ) : null}
      {room?.lastEvent != null && room.status !== "lobby" ? (
        <p className="play__event">{room.lastEvent}</p>
      ) : null}

      {room === null ? (
        <Join
          actions={actions}
          busy={busy}
          connected={connected}
          invited={urlCode}
          account={account}
        />
      ) : room.status === "lobby" ? (
        <Lobby room={room} seatId={seatId} actions={actions} chat={chat} account={account} />
      ) : (
        <>
          <Table
            room={room}
            seatId={seatId ?? ""}
            actions={actions}
            heldLocally={heldLocally}
            pendingRoll={pendingRoll}
          />
          <Chat log={chat} seatId={seatId} onSay={actions.say} />
        </>
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

/**
 * Who you are, if anyone. Guests see an invitation to sign in only when the
 * server actually has Discord configured — offering a button that answers 503
 * would be worse than offering nothing.
 */
function AccountBadge({ account }: { account: Account }) {
  if (account.loading) {
    return null;
  }
  if (account.profile === null) {
    return account.available ? (
      <a className="btn btn--ghost btn--small" href="/auth/discord">
        Sign in
      </a>
    ) : (
      <span className="account__guest">playing as a guest</span>
    );
  }
  const low = account.profile.chips < 2000;
  return (
    <span className="account">
      <Avatar
        name={account.profile.name}
        avatar={account.profile.avatar}
        accentColor={account.profile.accentColor}
        className="account__face"
      />
      <span className="account__name">{account.profile.name}</span>
      <span className="account__chips">{account.profile.chips.toLocaleString("en-US")}</span>
      {low ? (
        <button type="button" className="btn btn--ghost btn--small" onClick={account.claimDaily}>
          Top up
        </button>
      ) : null}
      <button type="button" className="account__out" onClick={account.signOut}>
        sign out
      </button>
    </span>
  );
}

/**
 * The stake. Only offered when everyone at the table is signed in and there
 * are no bots — a bot has no balance to lose and no account to pay, so letting
 * one into a pot would mint or destroy chips.
 */
function BuyIn({
  room,
  editable,
  signedIn,
  chips,
  onSet,
}: {
  room: RoomView;
  editable: boolean;
  signedIn: boolean;
  chips: number;
  onSet: (amount: number) => void;
}) {
  const bots = room.seats.some((seat) => seat.isBot);
  const guests = room.seats.some((seat) => !seat.signedIn);
  const blocked = bots || guests || !signedIn;

  return (
    <section className="rules" aria-label="Stake">
      <p className="panel__label">Stake</p>
      {blocked ? (
        <p className="rules__note">
          {bots
            ? "Bots play for free. Remove them to play for chips."
            : "Everyone has to be signed in to play for chips."}
        </p>
      ) : (
        <div className="rules__choices">
          {[0, 100, 500, 1000].map((amount) => (
            <button
              key={amount}
              type="button"
              role="radio"
              aria-checked={room.buyIn === amount}
              disabled={!editable || amount > chips}
              className={`rules__choice${room.buyIn === amount ? " rules__choice--on" : ""}`}
              onClick={() => onSet(amount)}
            >
              {amount === 0 ? "for fun" : amount.toLocaleString("en-US")}
            </button>
          ))}
        </div>
      )}
      {room.buyIn > 0 ? (
        <p className="rules__note">
          Pot of {room.pot.toLocaleString("en-US")} — winner takes it.
        </p>
      ) : null}
    </section>
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
  account,
}: {
  actions: RoomActions;
  busy: boolean;
  connected: boolean;
  /** A table code from the address bar, when someone followed a link. */
  invited: string;
  account: Account;
}) {
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState(invited);
  const [ruleset, setRuleset] = useState(RULESETS[0]?.name ?? "Classic");

  // Someone signed in already has a name, and the server will seat them under
  // it whatever this sends — so asking for one would be a question with no
  // answer that counts. Hold the field back until we know which they are,
  // rather than showing it and snatching it away.
  const signedInName = account.profile?.name ?? null;
  const askName = !account.loading && signedInName === null;
  const name = signedInName ?? typed;
  const ready = !account.loading && name.trim().length > 0 && connected && !busy;

  if (invited.length > 0) {
    return (
      <div className="join">
        <p className="join__pitch">
          You have been invited to table <strong>{invited}</strong>.{" "}
          {askName ? "Put in a name and sit down." : "Take a seat."}
        </p>
        {askName ? (
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="field__input"
              value={typed}
              maxLength={20}
              placeholder="Ada"
              // biome-ignore lint/a11y/noAutofocus: this screen exists only to take a name after following an invitation
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && ready) {
                  actions.join(name, invited);
                }
              }}
            />
          </label>
        ) : null}
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

      {askName ? (
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="field__input"
            value={typed}
            maxLength={20}
            placeholder="Ada"
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      ) : null}

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

/**
 * The table's code, and a one-press way to hand it to someone.
 *
 * The clipboard API only exists in a secure context, so over plain http on a
 * home network — which is exactly how someone invites the person next to them
 * — it is simply not there. Hence the older selection-based copy behind it,
 * and the readable link as a last resort: the code is the whole point of this
 * panel and must never be a dead end.
 */
function ShareCode({ code }: { code: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const link = `${window.location.origin}/${code}`;

  const copy = () => {
    void (async () => {
      try {
        if (navigator.clipboard !== undefined) {
          await navigator.clipboard.writeText(link);
          setSaid("Link copied");
        } else if (legacyCopy(link)) {
          setSaid("Link copied");
        } else {
          setSaid("Copy it from the box above");
        }
      } catch {
        setSaid(legacyCopy(link) ? "Link copied" : "Copy it from the box above");
      }
      setTimeout(() => setSaid(null), 2500);
    })();
  };

  return (
    <div className="panel lobby__share">
      <p className="panel__label">Share this code</p>
      <div className="lobby__share-body">
        <div className="lobby__code">{code}</div>
        <input className="lobby__link" value={link} readOnly aria-label="Link to this table" />
      </div>
      <button type="button" className="btn btn--wide lobby__copy" onClick={copy}>
        {said ?? "Copy link"}
      </button>
    </div>
  );
}

/** Pre-clipboard-API copy, for the plain-http case. True when it took. */
function legacyCopy(text: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = text;
    // Off-screen rather than hidden: a display:none field cannot be selected.
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

function Lobby({
  room,
  seatId,
  actions,
  chat,
  account,
}: {
  room: RoomView;
  seatId: string | null;
  actions: RoomActions;
  chat: ChatMessage[];
  account: Account;
}) {
  const you = room.seats.find((seat) => seat.id === seatId);
  const solo = room.seats.length === 1;

  return (
    <div className="lobby">
      <ShareCode code={room.code} />

      <div className="panel lobby__seating">
        <p className="panel__label">Seated · {room.seats.length} of 8</p>
        <div className="lobby__seats">
          {room.seats.map((seat) => (
            <div className="seat" key={seat.id}>
              <SeatAvatar seat={seat} />
              <div className="seat__who">
                <div className="seat__name">
                  {seat.name}
                  {seat.id === seatId ? " (you)" : ""}
                </div>
                <div className="seat__state">
                  {seat.waiting
                    ? "In the next game"
                    : seat.isBot
                      ? "Bot"
                      : seat.isHost
                        ? "Host"
                        : "Ready"}
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

      <div className="lobby__wide">
        <div className="lobby__stack">
          <HouseRulesEditor
            room={room}
            editable={you?.isHost === true}
            onChange={actions.setRules}
          />
          <BuyIn
            room={room}
            editable={you?.isHost === true}
            signedIn={account.profile !== null}
            chips={account.profile?.chips ?? 0}
            onSet={actions.setBuyIn}
          />
        </div>
        <Chat log={chat} seatId={seatId} onSay={actions.say} />
      </div>
    </div>
  );
}
