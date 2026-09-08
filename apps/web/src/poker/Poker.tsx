import type { SeatView, TableView } from "@backroom/game-poker";
import { BIG_BLIND, BUY_IN, FUN_STACK, SMALL_BLIND } from "@backroom/game-poker";
import { CODE_ALPHABET, CODE_LENGTH } from "@backroom/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, FaceDown } from "../blackjack/Cards.js";
import { ChipStack } from "../chips/ChipStack.js";
import { Chat } from "../game/Chat.js";
import { compact } from "../game/money.js";
import type { Account } from "../game/useAccount.js";
import { useAccount } from "../game/useAccount.js";
import { useCountdown } from "../game/useCountdown.js";
import { Navbar } from "../nav/Navbar.js";
import { PublicTables } from "../table/PublicTables.js";
import { SeatCount } from "../table/SeatCount.js";
import type { TableSocketHook } from "../table/useTableSocket.js";
import { useTableSocket } from "../table/useTableSocket.js";
import { useTableSound } from "./useTableSound.js";
import type { Move } from "./useIntent.js";
import { useIntent } from "./useIntent.js";
import "@backroom/game-blackjack/theme.css";
import "./poker.css";

/**
 * The felt, wired up.
 *
 * Built on the mockup in /style rather than beside it: the same stylesheet
 * draws both, so the table that was approved and the table that deals are the
 * same table. What is added here is everything the mockup could not have — a
 * seat that is somebody, a pot that is real chips, and a turn that runs out.
 */

type Table = TableSocketHook<TableView>;

const fmt = (n: number) => n.toLocaleString("en-US");

/** The five places a board card goes, in the order they are dealt. */
const SLOTS = ["flop1", "flop2", "flop3", "turn", "river"];

/**
 * What a poker table counts in.
 *
 * Down to the small blind, which the betting tray's plates do not reach: this
 * game's numbers are multiples of ten, and counted in hundreds every bet on
 * the felt would come out as one odd chip standing for the remainder. With
 * tens and twenties in the ladder every amount here lands on real plates.
 */
const TABLE_CHIPS = [1000, 500, 250, 100, 50, 20, 10];

export function Poker() {
  const navigate = useNavigate();
  const params = useParams();
  const account = useAccount();
  const raw = (params["code"] ?? "").toUpperCase();
  const looksLikeCode =
    raw.length === CODE_LENGTH && [...raw].every((letter) => CODE_ALPHABET.includes(letter));
  const urlCode = looksLikeCode ? raw : "";

  const back = useCallback(() => navigate("/poker"), [navigate]);
  /*
   * The balance in the corner follows the table. Chips leave it when you sit
   * down and come back when you stand up, and neither of those is something
   * the browser asked for at the moment it happens.
   */
  const table = useTableSocket<TableView>("poker", back, account.setChips);
  const { state, seatId } = table;
  useTableSound(state, seatId);

  useEffect(() => {
    document.documentElement.dataset["game"] = "poker";
    return () => {
      delete document.documentElement.dataset["game"];
    };
  }, []);

  useEffect(() => {
    if (state !== null && state.code !== urlCode) {
      navigate(`/poker/${state.code}`, { replace: true });
    }
  }, [state, urlCode, navigate]);

  if (raw.length > 0 && !looksLikeCode) {
    return <p className="not-found">No table with that code.</p>;
  }

  return (
    <main className="play">
      <Navbar
        game="Poker"
        {...(state !== null
          ? {
              table: {
                code: state.code,
                onLeave: table.leave,
                /*
                 * Asked twice mid-hand, because leaving one is folding: the
                 * chips already in the pot stay there, and the press that
                 * gives them up should not be one you can make by accident.
                 */
                confirm: state.street !== "waiting",
              },
            }
          : {})}
        account={account}
        connected={table.connected}
      />

      {table.error !== null ? <p className="play__error">{table.error}</p> : null}
      {state?.lastEvent != null ? <p className="play__event">{state.lastEvent}</p> : null}

      {state === null ? (
        <Sit table={table} invited={urlCode} account={account} />
      ) : (
        <>
          <Felt table={table} state={state} seatId={seatId} />
          <Chat log={table.chat} seatId={seatId} onSay={table.say} />
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------- the felt */

export function Felt({
  table,
  state,
  seatId,
}: {
  table: Table;
  state: TableView;
  seatId: string | null;
}) {
  const intent = useIntent(state, seatId, table.error);
  const me = state.seats.find((seat) => seat.id === seatId) ?? null;

  /*
   * Your seat at the bottom, everybody else round from it in dealing order.
   *
   * Rotated rather than sorted: the order seats come in is the order the table
   * plays in, and losing it would put the player to your left somewhere other
   * than on your left. Somebody watching has no seat to rotate to, so they get
   * the table as it is.
   */
  const seats = useMemo(() => {
    const mine = state.seats.findIndex((seat) => seat.id === seatId);
    return mine < 0
      ? state.seats
      : [...state.seats.slice(mine), ...state.seats.slice(0, mine)];
  }, [state.seats, seatId]);

  const won = useMemo(
    () => new Map(state.paid.map((one) => [one.seatId, one])),
    [state.paid],
  );

  return (
    <div className="pk">
      <div className="pk__table">
        <div className="pk__felt" />

        <div className="pk__middle">
          <p className="pk__pot">
            <span className="pk__pot-label">Pot</span>
            <strong>{fmt(state.pot)}</strong>
            {state.pot > 0 ? (
              <span className="pk__pot-chips">
                <ChipStack amount={state.pot} width={19} ladder={TABLE_CHIPS} most={15} tallest={5} />
              </span>
            ) : null}
          </p>
          <div className="pk__board">
            {state.board.map((one, at) => (
              <Card key={`${one.rank}${one.suit}`} card={one} deal={at} />
            ))}
            {/* The streets still to come, so the board keeps its width and
                nothing shuffles sideways when a card lands. */}
            {SLOTS.slice(state.board.length).map((slot) => (
              <span className="pk__gap" key={slot} />
            ))}
          </div>
          {state.street === "waiting" ? (
            <p className="pk__waiting">
              {state.seats.filter((seat) => seat.stack > 0).length < 2
                ? "Waiting for another player."
                : "Next hand shortly."}
            </p>
          ) : null}
        </div>

        {seats.map((seat, at) => (
          <Seat
            key={seat.id}
            seat={seat}
            at={at}
            of={seats.length}
            state={state}
            mine={seat.id === seatId}
            won={won.get(seat.id)?.chips ?? null}
            said={won.get(seat.id)?.said ?? null}
            /* What this player asked for, until the table answers. */
            pending={seat.id === seatId ? intent : null}
          />
        ))}

        {seats.map((seat, at) => {
          const chips =
            seat.id === seatId && intent.committed !== null ? intent.committed : seat.committed;
          return chips > 0 ? (
            <span className="pk__bet" key={`bet-${seat.id}`} style={seatAt(at, seats.length)}>
              {/*
                * Chips and the figure, not one or the other. The pile is what
                * is read across a table — two chips against nine says who is
                * in for what before either number has been — and the figure is
                * what settles it once you care about the exact amount.
                */}
              <ChipStack amount={chips} width={16} ladder={TABLE_CHIPS} most={12} tallest={4} />
              <span className="pk__bet-figure">{fmt(chips)}</span>
            </span>
          ) : null;
        })}
      </div>

      <Actions table={table} state={state} me={me} intent={intent} />
      {/*
        * Only at a table playing for nothing, and only for whoever opened it.
        * The server refuses it anywhere else whatever the browser shows —
        * hiding a control is a courtesy, refusing the message is the rule.
        */}
      {state.forFun && state.hostId === seatId ? (
        <div className="pk__bots">
          <span className="pk__bots-label">Deal somebody in</span>
          {(["easy", "normal", "hard"] as const).map((skill) => (
            <button
              key={skill}
              type="button"
              className="pk__bot"
              disabled={table.busy || state.seats.length >= 10}
              onClick={() => table.addBot(skill)}
            >
              {skill}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where a seat sits, as a fraction of the felt.
 *
 * Counted from the bottom middle and going round, so seat one is always you.
 * Only which way round — how far is in the stylesheet, so a container query
 * can pull the ring in on a narrow felt without React having to measure
 * anything.
 */
function seatAt(index: number, of: number): React.CSSProperties {
  const angle = Math.PI / 2 + (index / of) * Math.PI * 2;
  return {
    "--cos": Math.cos(angle).toFixed(4),
    "--sin": Math.sin(angle).toFixed(4),
  } as React.CSSProperties;
}

function Seat({
  seat,
  at,
  of,
  state,
  mine,
  won,
  said,
  pending,
}: {
  seat: SeatView;
  at: number;
  of: number;
  state: TableView;
  mine: boolean;
  won: number | null;
  said: string | null;
  pending: { move: Move | null } | null;
}) {
  /*
   * A press shows here before the table has answered it, which is the whole of
   * the optimistic bargain: folding is this player's own decision, so the seat
   * can look folded the moment they say so.
   */
  const folded = seat.folded || pending?.move === "fold";
  const acting = state.toAct === seat.id && pending?.move == null;
  const look = won !== null ? "won" : folded ? "folded" : seat.allIn ? "allIn" : acting ? "acting" : "waiting";

  const mark =
    state.button === seat.id
      ? "D"
      : state.smallBlindId === seat.id
        ? "SB"
        : state.bigBlindId === seat.id
          ? "BB"
          : null;

  return (
    <div
      className={`pk__seat pk__seat--${look}${mine ? " pk__seat--you" : ""}${seat.connected ? "" : " pk__seat--away"}`}
      style={seatAt(at, of)}
    >
      <div className="pk__cards">
        {seat.hole.length === 0 || folded ? null : (
          seat.hole.map((one, index) =>
            one === null ? (
              // Not ours to see. A face-down card is the truth, and stays the
              // truth right up until they turn it over.
              // biome-ignore lint/suspicious/noArrayIndexKey: a hole has two places, not two cards
              <FaceDown key={index} deal={index} />
            ) : (
              <Card key={`${one.rank}${one.suit}`} card={one} deal={index} />
            ),
          )
        )}
      </div>
      <div className="pk__who">
        <span className="pk__name">
          {seat.name}
          {seat.isBot ? <span className="pk__bot-mark">bot</span> : null}
        </span>
        <span className="pk__stack">
          {/*
            * What they have left, as weight rather than only as a figure. Off
            * on a narrow felt, where the seat has no room to spare and the
            * number says it on its own.
            */}
          {seat.stack > 0 ? (
            <span className="pk__pile">
              <ChipStack amount={seat.stack} width={11} ladder={TABLE_CHIPS} most={9} tallest={3} />
            </span>
          ) : null}
          {fmt(seat.stack)}
        </span>
        {seat.committed > 0 ? <span className="pk__wager">bet {fmt(seat.committed)}</span> : null}
      </div>
      {mark === null ? null : (
        <span className={`pk__mark pk__mark--${mark.toLowerCase()}`}>{mark}</span>
      )}
      {said !== null ? <span className="pk__says">{said}</span> : null}
      {said === null && won !== null ? (
        <span className="pk__says">won {fmt(won)}</span>
      ) : null}
      {acting ? <Clock endsAt={state.turnEndsAt} /> : null}
    </div>
  );
}

/** How long the seat now to act has left, counted down out here. */
function Clock({ endsAt }: { endsAt: number | null }) {
  const left = useCountdown(endsAt);
  if (left === null) {
    return null;
  }
  return <span className="pk__clock">{Math.ceil(left / 1000)}</span>;
}

/* ----------------------------------------------------------- the controls */

export function Actions({
  table,
  state,
  me,
  intent,
}: {
  table: Table;
  state: TableView;
  me: SeatView | null;
  intent: ReturnType<typeof useIntent>;
}) {
  const you = state.you;
  const mine = me !== null && state.toAct === me.id;

  const send = (kind: Move, to: number, action: Record<string, unknown>) => {
    intent.send(kind, to);
    table.act(action);
  };

  if (me === null) {
    return <p className="pk__note">You are watching this table.</p>;
  }

  /*
   * Nothing in front of you is the one thing to fix before anything else can
   * happen, so it is the only control offered.
   */
  if (me.stack === 0 && me.committed === 0 && !me.folded) {
    return (
      <div className="pk__actions">
        <button
          type="button"
          className="pk__act pk__act--raise"
          disabled={table.busy}
          onClick={() => table.act({ type: "buyIn" })}
        >
          Sit down with {compact(state.forFun ? FUN_STACK : BUY_IN)}
        </button>
        <p className="pk__note">
          {state.forFun
            ? "Play money. It lives at this table and is gone when it closes."
            : "Chips come off your balance and go in front of you. Stand up and whatever is still there comes back."}
        </p>
      </div>
    );
  }

  if (!mine || you === null) {
    return (
      <p className="pk__note">
        {state.street === "waiting"
          ? "Waiting for the next hand."
          : intent.move !== null
            ? "Sent."
            : "Waiting for the others."}
      </p>
    );
  }

  const callAll = you.toCall >= me.stack;

  return (
    <div className="pk__actions">
      <button
        type="button"
        className="pk__act pk__act--fold"
        disabled={table.busy}
        onClick={() => send("fold", 0, { type: "fold" })}
      >
        Fold
      </button>

      {you.toCall === 0 ? (
        <button
          type="button"
          className="pk__act"
          disabled={table.busy}
          onClick={() => send("check", me.committed, { type: "check" })}
        >
          Check
        </button>
      ) : (
        <button
          type="button"
          className="pk__act"
          disabled={table.busy}
          onClick={() =>
            send("call", me.committed + you.toCall, { type: callAll ? "allIn" : "call" })
          }
        >
          {callAll ? `All in ${fmt(me.stack)}` : `Call ${fmt(you.toCall)}`}
        </button>
      )}

      {you.canRaise ? (
        /*
         * Keyed on whose turn it is, so a new decision gets a new slider
         * sitting at the new smallest raise. A `key` rather than an effect
         * that resets it: React already has one way to say "this is a
         * different one of these", and reaching for a second means two things
         * deciding when the number goes back.
         */
        <Raise
          key={state.toAct ?? "none"}
          you={you}
          step={state.bigBlind}
          stack={me.stack}
          busy={table.busy}
          onRaise={(to) =>
            send(
              to >= you.maxRaiseTo ? "allIn" : "raise",
              to,
              to >= you.maxRaiseTo ? { type: "allIn" } : { type: "raise", amount: to },
            )
          }
        />
      ) : null}
    </div>
  );
}

/** How much to raise, and the press that sends it. */
function Raise({
  you,
  step,
  stack,
  busy,
  onRaise,
}: {
  you: NonNullable<TableView["you"]>;
  step: number;
  stack: number;
  busy: boolean;
  onRaise: (to: number) => void;
}) {
  /*
   * Kept as a raise-to total because that is what a raise is sent as. Anything
   * else would be converting between two units in the one place where getting
   * it wrong costs somebody the wrong number of chips.
   */
  const [to, setTo] = useState(you.minRaiseTo);
  const all = to >= you.maxRaiseTo;

  return (
    <>
      <button
        type="button"
        className="pk__act pk__act--raise"
        disabled={busy}
        onClick={() => onRaise(to)}
      >
        {all ? `All in ${fmt(stack)}` : `Raise to ${fmt(to)}`}
      </button>
      <label className="pk__slider">
        <span className="pk__slider-label">How much</span>
        <input
          type="range"
          min={you.minRaiseTo}
          max={you.maxRaiseTo}
          /*
           * A blind at a time. Chips are counted in blinds at a poker table,
           * and a slider stepping in ones is one nobody can land on a round
           * number with.
           */
          step={step}
          value={to}
          onChange={(event) => setTo(Number(event.target.value))}
        />
      </label>
    </>
  );
}

/* ------------------------------------------------------------- the lobby */

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
  const guest = account.profile === null;
  const [maxSeats, setMaxSeats] = useState(6);
  const [typed, setTyped] = useState("");
  /*
   * Null until the host picks, rather than a boolean seeded from `guest`.
   * Seeding it freezes the answer at the first render, which happens while the
   * account is still on its way — and a profile that has not arrived looks
   * exactly like a guest.
   */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const forFun = chosen ?? guest;
  /*
   * A signed-in player's name is the account's and the server uses that
   * whatever is sent. A guest has none, so at a for-fun table they type one.
   */
  const name = account.profile?.name ?? typed.trim();
  const named = name.length > 0;

  return (
    <div className="join">
      <p className="join__pitch">
        Texas hold'em, {fmt(SMALL_BLIND)} and {fmt(BIG_BLIND)} blinds. Everybody plays each other,
        so nothing is won here that somebody at the table did not put in.
      </p>

      {account.loading || !guest ? null : (
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
      )}

      {account.loading || !guest ? null : (
        <p className="join__warn">
          Playing for fun deals you play money that lives at the table and nowhere else. Sign in to
          play for real chips.
        </p>
      )}

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
          {/* Not gated on signing in: whether a guest may sit depends on what
              the table plays for, which only the server knows. It refuses in
              words. */}
          <button
            type="button"
            className="btn btn--wide"
            disabled={!ready || !named}
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

          <div className="variants" role="radiogroup" aria-label="What the table plays for">
            {[false, true].map((option) => (
              <button
                key={String(option)}
                type="button"
                role="radio"
                aria-checked={forFun === option}
                // A guest has nothing real to stake, so the choice is not
                // offered rather than offered and refused.
                disabled={!option && guest}
                className={`variant${forFun === option ? " variant--on" : ""}`}
                onClick={() => setChosen(option)}
              >
                <span className="variant__name">{option ? "For fun" : "For chips"}</span>
                <span className="variant__note">
                  {option
                    ? "Play money, and you can deal bots in. Anybody can sit down."
                    : guest
                      ? "Sign in to play for real chips."
                      : "Real chips, from your balance."}
                </span>
              </button>
            ))}
          </div>

          <SeatCount value={maxSeats} onChange={setMaxSeats} />
          <p className="panel__note">
            You get a five-character code to share. Sitting down costs{" "}
            {forFun ? `${compact(FUN_STACK)} in play money` : compact(BUY_IN)}
            {forFun ? "." : ", and what is still in front of you comes back when you stand up."}
          </p>
          <button
            type="button"
            className="btn btn--wide"
            disabled={table.busy || !named}
            onClick={() => table.create(name, { game: "poker", forFun, maxSeats })}
          >
            Open a table
          </button>
        </div>
      </div>

      <PublicTables
        game="poker"
        busy={table.busy}
        canSit={named}
        whyNotSit="Put in a name first."
        onJoin={(open) => table.join(name, open)}
        onWatch={(open) => table.watch(open)}
      />
    </div>
  );
}

export default Poker;
