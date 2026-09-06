import { CODE_ALPHABET, CODE_LENGTH } from "@backroom/shared";
import type { TableView } from "@backroom/game-blackjack";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AccountBadge } from "../account/AccountBadge.js";
import { Avatar } from "../game/Avatar.js";
import { Sign } from "../game/Sign.js";
import { useAccount } from "../game/useAccount.js";
import type { Account } from "../game/useAccount.js";
import { useTableSocket } from "../table/useTableSocket.js";
import type { TableSocketHook } from "../table/useTableSocket.js";
import { Hand } from "./Cards.js";
import "@backroom/game-blackjack/theme.css";
import "./blackjack.css";

type Table = TableSocketHook<TableView>;

const fmt = (n: number) => n.toLocaleString("en-US");
/** Denominations you can stack, not amounts you can pick from. */
const CHIPS = [100, 250, 500, 1000];

export function Blackjack() {
  const navigate = useNavigate();
  const params = useParams();
  const account = useAccount();
  const raw = (params["code"] ?? "").toUpperCase();
  const looksLikeCode =
    raw.length === CODE_LENGTH && [...raw].every((letter) => CODE_ALPHABET.includes(letter));
  const urlCode = looksLikeCode ? raw : "";

  const back = useCallback(() => navigate("/blackjack"), [navigate]);
  const table = useTableSocket<TableView>("blackjack", back);
  const { state, seatId } = table;

  /*
   * Which room you are standing in, on the document rather than this element:
   * the page's background lives on body, so a game repainting only its own
   * subtree would sit in the building's colours with a green rectangle in it.
   */
  useEffect(() => {
    document.documentElement.dataset["game"] = "blackjack";
    return () => {
      delete document.documentElement.dataset["game"];
    };
  }, []);

  // The address bar follows the table, so the link can be shared and a refresh
  // lands back at the same one.
  useEffect(() => {
    if (state !== null && state.code !== urlCode) {
      navigate(`/blackjack/${state.code}`, { replace: true });
    }
  }, [state, urlCode, navigate]);

  if (raw.length > 0 && !looksLikeCode) {
    return <p className="not-found">No table with that code.</p>;
  }

  return (
    <main className="play">
      <header className="play__head">
        <h1 className="play__mark">
          <Link to="/" aria-label="Back to The Back Room">
            <Sign />
          </Link>
        </h1>
        <span className="play__game">Blackjack</span>
        {state !== null ? <span className="play__code">{state.code}</span> : null}
        {state !== null ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={table.leave}>
            Leave
          </button>
        ) : null}
        <AccountBadge account={account} />
        <span className={`play__link${table.connected ? " play__link--up" : ""}`}>
          {table.connected ? "connected" : "offline"}
        </span>
      </header>

      {table.error !== null ? <p className="play__error">{table.error}</p> : null}
      {state?.lastEvent != null ? <p className="play__event">{state.lastEvent}</p> : null}

      {state === null ? (
        <Sit table={table} invited={urlCode} account={account} />
      ) : (
        <Felt table={table} state={state} seatId={seatId} />
      )}
    </main>
  );
}

function Felt({
  table,
  state,
  seatId,
}: {
  table: Table;
  state: TableView;
  seatId: string | null;
}) {
  const me = state.seats.find((seat) => seat.id === seatId) ?? null;
  const myTurn = state.turnSeatId === seatId && seatId !== null;
  const isHost = state.hostId === seatId && seatId !== null;

  return (
    <div className="bj">
      <section className="bj__dealer">
        <p className="bj__whose">Dealer</p>
        <Hand cards={state.dealer.cards} hidden={state.dealer.hidden} />
        <span className="bj__total">
          {state.dealer.cards.length === 0
            ? "—"
            : state.dealer.hidden
              ? `showing ${state.dealer.total}`
              : state.dealer.total}
        </span>
      </section>

      <div className="bj__seats">
        {state.seats.map((seat) => (
          <article
            key={seat.id}
            className={`bj__seat${state.turnSeatId === seat.id ? " bj__seat--turn" : ""}${
              seat.waiting ? " bj__seat--waiting" : ""
            }${seat.connected ? "" : " bj__seat--gone"}`}
          >
            <header className="bj__who">
              <Avatar
                name={seat.name}
                avatar={seat.avatar}
                accentColor={seat.accentColor}
                className="seat__avatar"
              />
              <span className="seat__name">
                {seat.name}
                {seat.id === seatId ? " (you)" : ""}
              </span>
              {seat.bet > 0 ? <span className="bj__bet">{fmt(seat.bet)}</span> : null}
            </header>
            <Hand cards={seat.cards} />
            <footer className={`bj__result${outcomeTone(seat.outcome)}`}>
              {seatLine(seat, state.phase)}
            </footer>
          </article>
        ))}
        {state.watching > 0 ? (
          <p className="bj__watchers">
            {state.watching === 1 ? "1 person watching" : `${state.watching} people watching`}
          </p>
        ) : null}
      </div>

      <aside className="bj__actions panel">
        {seatId === null ? (
          <>
            <p className="panel__label">Watching</p>
            <p className="panel__note">
              You are stood behind the table. Take a seat between hands to play.
            </p>
          </>
        ) : state.phase === "betting" ? (
          <Betting table={table} mine={me?.bet ?? 0} min={state.minBet} max={state.maxBet} isHost={isHost} />
        ) : state.phase === "settled" ? (
          <>
            <p className="panel__label">Hand over</p>
            <p className="panel__note">{settledLine(me)}</p>
            {isHost ? (
              <button
                type="button"
                className="btn btn--wide"
                onClick={() => table.act({ type: "nextHand" })}
              >
                Another hand
              </button>
            ) : (
              <p className="panel__note">Waiting for the host to deal again.</p>
            )}
          </>
        ) : (
          <>
            <p className="panel__label">{myTurn ? "Your move" : "Waiting"}</p>
            <button
              type="button"
              className="btn btn--wide"
              disabled={!myTurn}
              onClick={() => table.act({ type: "hit" })}
            >
              Hit
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              disabled={!myTurn}
              onClick={() => table.act({ type: "stand" })}
            >
              Stand
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              // First two cards only: that is the rule, and also the only point
              // at which doubling is a decision.
              disabled={!myTurn || (me?.cards.length ?? 0) !== 2}
              onClick={() => table.act({ type: "double" })}
            >
              Double for {fmt(me?.bet ?? 0)}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

/** What a seat's own line says, which depends on how far the hand has got. */
function seatLine(seat: TableView["seats"][number], phase: TableView["phase"]): string {
  if (seat.waiting) {
    return "In on the next hand";
  }
  if (!seat.connected) {
    return "Dropped out";
  }
  if (seat.cards.length === 0) {
    if (phase !== "betting") {
      return "Sitting this one out";
    }
    return seat.bet > 0 ? "Ready" : "Yet to bet";
  }
  switch (seat.outcome) {
    case "blackjack":
      return `Blackjack — ${fmt(seat.returned)}`;
    case "won":
      return `Won ${fmt(seat.returned - seat.bet)}`;
    case "push":
      return `Push on ${seat.total}`;
    case "lost":
      return `Lost on ${seat.total}`;
    case "bust":
      return `Bust on ${seat.total}`;
    default:
      return seat.soft ? `Soft ${seat.total}` : String(seat.total);
  }
}

function outcomeTone(outcome: TableView["seats"][number]["outcome"]): string {
  if (outcome === "won" || outcome === "blackjack") {
    return " bj__result--good";
  }
  if (outcome === "lost" || outcome === "bust") {
    return " bj__result--bad";
  }
  return "";
}

function settledLine(me: TableView["seats"][number] | null): string {
  if (me === null || me.bet === 0) {
    return "You sat that one out.";
  }
  const net = me.returned - me.bet;
  if (net > 0) {
    return `You are up ${fmt(net)}.`;
  }
  if (net === 0) {
    return "Your stake came back.";
  }
  return `That one cost you ${fmt(-net)}.`;
}

/**
 * Stacking a stake.
 *
 * Chips add rather than replace, the way they do on a real felt, and the whole
 * stack comes back off in one go — a stake you cannot take back before the
 * cards are out would make a misclick cost a hand.
 */
function Betting({
  table,
  mine,
  min,
  max,
  isHost,
}: {
  table: Table;
  mine: number;
  min: number;
  max: number;
  isHost: boolean;
}) {
  const stake = (amount: number) => table.act({ type: "bet", amount });

  return (
    <>
      <p className="panel__label">Your bet</p>
      <div className="bj__chips">
        {CHIPS.map((amount) => (
          <button
            key={amount}
            type="button"
            className="bj__chip"
            disabled={mine + amount > max}
            onClick={() => stake(mine + amount)}
          >
            {fmt(amount)}
          </button>
        ))}
      </div>
      <p className={`bj__stake${mine > 0 ? " bj__stake--on" : ""}`}>
        {mine > 0 ? fmt(mine) : `nothing yet — ${fmt(min)} minimum`}
      </p>
      <button
        type="button"
        className="btn btn--ghost btn--wide"
        disabled={mine === 0}
        onClick={() => stake(0)}
      >
        Take it back
      </button>
      {isHost ? (
        <button type="button" className="btn btn--wide" onClick={() => table.act({ type: "deal" })}>
          Deal
        </button>
      ) : (
        <p className="panel__note">The host deals once everyone has bet.</p>
      )}
    </>
  );
}

function Sit({
  table,
  invited,
  account,
}: {
  table: Table;
  invited: string;
  account: Account;
}) {
  const [code, setCode] = useState(invited);
  const ready = code.length === CODE_LENGTH && !table.busy;
  /*
   * The server ignores this and uses the name on the account, which is the
   * only name a blackjack seat can have. It is sent because the protocol asks
   * for one, not because it decides anything.
   */
  const name = account.profile?.name ?? "";

  return (
    <div className="join">
      <p className="join__pitch">
        Beat the dealer to twenty-one without going past it. Blackjack pays three to two, the
        dealer stands on seventeen.
      </p>
      {account.loading ? null : account.profile === null ? (
        <p className="join__warn">
          {/* Not a limitation worth hiding: a hand with nothing staked has
              nothing to decide, so there is no friendly blackjack to offer. */}
          Every hand is played for chips, so you will need to sign in before you can sit down. You
          can still watch a table.
        </p>
      ) : null}
      <div className="join__split">
        <div className="panel">
          <p className="panel__label">Join a table</p>
          <input
            className="field__input field__input--code"
            value={code}
            maxLength={CODE_LENGTH}
            placeholder="XKQ37"
            aria-label="Table code"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="btn btn--wide"
            disabled={!ready || account.profile === null}
            onClick={() => table.join(name, code)}
          >
            Take a seat
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--wide"
            disabled={!ready}
            onClick={() => table.watch(code)}
          >
            Just watch
          </button>
        </div>
        <div className="panel">
          <p className="panel__label">Open your own</p>
          <p className="panel__note">
            You get a five-character code to share. Six seats, everybody playing the dealer rather
            than each other.
          </p>
          <button
            type="button"
            className="btn btn--wide"
            disabled={table.busy || account.profile === null}
            onClick={() => table.create(name, { game: "blackjack" })}
          >
            Open a table
          </button>
        </div>
      </div>
    </div>
  );
}
