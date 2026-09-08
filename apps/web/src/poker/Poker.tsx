import type { SeatView, TableView } from "@backroom/game-poker";
import { BIG_BLIND, BUY_IN, FUN_STACK, SMALL_BLIND } from "@backroom/game-poker";
import { CODE_ALPHABET, CODE_LENGTH } from "@backroom/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * What a pre-selected move means when the turn actually arrives.
 *
 * Armed while somebody else is deciding and spent the moment it is your go.
 * Every one of them can be made impossible by what happens in between — you
 * arm a check and somebody bets — and where that is so the arming is dropped
 * and the decision handed back, rather than turned into the nearest thing that
 * is still legal. Guessing at a move somebody did not make is how a player
 * loses a stack to a button they pressed a minute ago.
 */
export type Pre = "fold" | "checkFold" | "check" | "callAny" | "betPot";

const PRE_CHOICES: Array<{ pre: Pre; label: string; hint: string }> = [
  { pre: "fold", label: "Fold", hint: "Fold as soon as it is your turn" },
  { pre: "checkFold", label: "Check / Fold", hint: "Check if it is free, fold if it is not" },
  { pre: "check", label: "Check", hint: "Check — dropped if somebody bets" },
  { pre: "callAny", label: "Call any", hint: "Call whatever it has come to" },
  { pre: "betPot", label: "Bet pot", hint: "Bet or raise the size of the pot" },
];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

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

  /*
   * What has been armed, and which betting round it was armed in.
   *
   * The round is carried along with it rather than cleared by an effect
   * watching the street. A pre-selection is about the decision in front of you,
   * and once the next card is out that is a different decision — so it lapses
   * by simply no longer matching, which needs nothing to remember to clear it.
   */
  const [armed, setArmed] = useState<{ pre: Pre; street: string } | null>(null);
  const live = armed !== null && armed.street === state.street ? armed.pre : null;

  const send = (kind: Move, to: number, action: Record<string, unknown>) => {
    intent.send(kind, to);
    table.act(action);
  };

  /*
   * Held in a ref because the effect below has to fire on the turn arriving and
   * on nothing else. Everything this reads changes on every broadcast, and an
   * effect that listed all of it would run constantly.
   */
  const spend = useRef<() => void>(() => undefined);
  spend.current = () => {
    if (me === null || you === null || live === null) {
      return;
    }
    const callAll = you.toCall >= me.stack;
    const potTo = clamp(
      me.committed + you.toCall + (state.pot + you.toCall),
      you.minRaiseTo,
      you.maxRaiseTo,
    );
    if (live === "fold") {
      send("fold", 0, { type: "fold" });
      return;
    }
    if (live === "checkFold") {
      if (you.toCall === 0) {
        send("check", me.committed, { type: "check" });
      } else {
        send("fold", 0, { type: "fold" });
      }
      return;
    }
    if (live === "check") {
      /*
       * Somebody bet after this was armed, so checking is not a move any more.
       * Handed back rather than turned into a call: a call is a different
       * decision and nobody made it.
       */
      if (you.toCall === 0) {
        send("check", me.committed, { type: "check" });
      }
      return;
    }
    if (live === "callAny") {
      if (you.toCall === 0) {
        send("check", me.committed, { type: "check" });
      } else {
        send("call", me.committed + you.toCall, { type: callAll ? "allIn" : "call" });
      }
      return;
    }
    if (you.canRaise) {
      send(
        potTo >= you.maxRaiseTo ? "allIn" : "raise",
        potTo,
        potTo >= you.maxRaiseTo ? { type: "allIn" } : { type: "raise", amount: potTo },
      );
    }
  };

  /* The turn arriving is the whole trigger, so it is the whole dependency. */
  const ready = mine && live !== null && you !== null;
  useEffect(() => {
    if (ready) {
      setArmed(null);
      spend.current();
    }
  }, [ready]);

  if (me === null) {
    return <p className="pk__note">You are watching this table.</p>;
  }

  /*
   * Nothing in front of you is the one thing to fix before anything else can
   * happen, so it is the only control offered.
   */
  if (me.stack === 0 && me.committed === 0 && !me.folded) {
    return (
      <div className="pk__controls">
        <div className="pk__acts">
          <button
            type="button"
            className="pk__act pk__act--raise"
            disabled={table.busy}
            aria-label={`Sit down with ${compact(state.forFun ? FUN_STACK : BUY_IN)}`}
            onClick={() => table.act({ type: "buyIn" })}
          >
            <span className="pk__act-name">Sit down with</span>
            <span className="pk__act-figure">{compact(state.forFun ? FUN_STACK : BUY_IN)}</span>
          </button>
        </div>
        <p className="pk__note">
          {state.forFun
            ? "Play money. It lives at this table and is gone when it closes."
            : "Chips come off your balance and go in front of you. Stand up and whatever is still there comes back."}
        </p>
      </div>
    );
  }

  if (!mine || you === null) {
    /*
     * Somebody else is deciding. A hand you are still in gets the choices you
     * could make in advance; one you are out of gets a line of text, because
     * arming a move for a hand you have folded is arming nothing.
     */
    const inHand = state.street !== "waiting" && !me.folded && me.hole.length > 0;
    if (!inHand) {
      return (
        <p className="pk__note">
          {state.street === "waiting" ? "Waiting for the next hand." : "Waiting for the others."}
        </p>
      );
    }
    return (
      <div className="pk__controls">
        <div className="pk__pre" role="group" aria-label="Decide in advance">
          {PRE_CHOICES.map(({ pre, label, hint }) => (
            <button
              key={pre}
              type="button"
              className={`pk__prebtn${live === pre ? " pk__prebtn--on" : ""}`}
              aria-pressed={live === pre}
              title={hint}
              onClick={() => setArmed(live === pre ? null : { pre, street: state.street })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="pk__note">
          {live === null
            ? "Waiting for the others — or decide now, and it plays itself."
            : "Armed. It goes the moment the turn reaches you, and lapses at the next card."}
        </p>
      </div>
    );
  }

  return (
    <OnTurn
      /*
       * Keyed on the decision, so a new one arrives with the amount sitting at
       * the smallest legal raise. A `key` rather than an effect that resets it:
       * React already has one way to say "this is a different one of these",
       * and reaching for a second means two things deciding when it goes back.
       */
      key={`${state.street}:${state.toAct ?? "none"}`}
      you={you}
      me={me}
      pot={state.pot}
      blind={state.bigBlind}
      busy={table.busy}
      onAct={send}
    />
  );
}

/**
 * The controls for a decision that is actually in front of you.
 *
 * Three buttons and, when there is a raise to make, a way to say how much. The
 * amount sits above the buttons rather than beside them: it is what the raise
 * button is going to do, and a figure placed after the control that spends it
 * reads as a footnote to a decision already taken.
 */
function OnTurn({
  you,
  me,
  pot,
  blind,
  busy,
  onAct,
}: {
  you: NonNullable<TableView["you"]>;
  me: SeatView;
  pot: number;
  blind: number;
  busy: boolean;
  onAct: (kind: Move, to: number, action: Record<string, unknown>) => void;
}) {
  const [to, setTo] = useState(you.minRaiseTo);
  const at = clamp(to, you.minRaiseTo, you.maxRaiseTo);
  const all = at >= you.maxRaiseTo;
  const callAll = you.toCall >= me.stack;
  /* Opening the betting is a bet; putting it up over somebody else is a raise. */
  const opening = you.toCall === 0;

  /*
   * A slice of the pot, as a total to raise *to*.
   *
   * The pot a raise is measured against is the one that would exist after the
   * call — what is already in, plus what it costs you to stay. Measuring
   * against the pot as it stands is the usual way to get this wrong, and it
   * comes out short by exactly the call every time.
   */
  const sliceTo = (part: number) =>
    clamp(
      me.committed + you.toCall + Math.round(((pot + you.toCall) * part) / blind) * blind,
      you.minRaiseTo,
      you.maxRaiseTo,
    );

  const span = Math.max(1, you.maxRaiseTo - you.minRaiseTo);

  return (
    <div className="pk__controls">
      {you.canRaise ? (
        <div className="pk__amount">
          <div className="pk__dial">
            <button
              type="button"
              className="pk__step"
              aria-label="Less"
              disabled={at <= you.minRaiseTo}
              onClick={() => setTo(clamp(at - blind, you.minRaiseTo, you.maxRaiseTo))}
            >
              −
            </button>
            <span className="pk__figure">
              <span className="pk__figure-label">{opening ? "Bet" : "Raise to"}</span>
              <strong>{fmt(at)}</strong>
            </span>
            <button
              type="button"
              className="pk__step"
              aria-label="More"
              disabled={all}
              onClick={() => setTo(clamp(at + blind, you.minRaiseTo, you.maxRaiseTo))}
            >
              +
            </button>
          </div>

          <input
            type="range"
            className="pk__range"
            aria-label={opening ? "How much to bet" : "How much to raise to"}
            min={you.minRaiseTo}
            max={you.maxRaiseTo}
            step={blind}
            value={at}
            /* How far along the track is filled, which CSS cannot work out for
               itself — a range input has no selector for its own value. */
            style={{ "--at": `${((at - you.minRaiseTo) / span) * 100}%` } as React.CSSProperties}
            onChange={(event) => setTo(Number(event.target.value))}
          />

          <div className="pk__slices">
            <button type="button" className="pk__slice" onClick={() => setTo(you.minRaiseTo)}>
              Min
            </button>
            {(
              [
                [0.5, "½ pot"],
                [0.75, "¾ pot"],
                [1, "Pot"],
              ] as Array<[number, string]>
            ).map(([part, name]) => (
              <button
                key={name}
                type="button"
                className="pk__slice"
                onClick={() => setTo(sliceTo(part))}
              >
                {name}
              </button>
            ))}
            <button type="button" className="pk__slice" onClick={() => setTo(you.maxRaiseTo)}>
              All in
            </button>
          </div>
        </div>
      ) : null}

      <div className="pk__acts">
        <button
          type="button"
          className="pk__act pk__act--fold"
          disabled={busy}
          onClick={() => onAct("fold", 0, { type: "fold" })}
        >
          Fold
        </button>

        {opening ? (
          <button
            type="button"
            className="pk__act"
            disabled={busy}
            onClick={() => onAct("check", me.committed, { type: "check" })}
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            className="pk__act"
            disabled={busy}
            aria-label={
              callAll ? `All in ${fmt(me.stack)}` : `Call ${fmt(you.toCall)}`
            }
            onClick={() =>
              onAct("call", me.committed + you.toCall, { type: callAll ? "allIn" : "call" })
            }
          >
            <span className="pk__act-name">{callAll ? "All in" : "Call"}</span>
            <span className="pk__act-figure">{fmt(callAll ? me.stack : you.toCall)}</span>
          </button>
        )}

        {you.canRaise ? (
          <button
            type="button"
            className="pk__act pk__act--raise"
            disabled={busy}
            aria-label={`${all ? "All in" : opening ? "Bet" : "Raise to"} ${fmt(
              all ? me.committed + me.stack : at,
            )}`}
            onClick={() =>
              onAct(
                all ? "allIn" : "raise",
                at,
                all ? { type: "allIn" } : { type: "raise", amount: at },
              )
            }
          >
            <span className="pk__act-name">{all ? "All in" : opening ? "Bet" : "Raise to"}</span>
            <span className="pk__act-figure">{fmt(all ? me.committed + me.stack : at)}</span>
          </button>
        ) : null}
      </div>
    </div>
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
