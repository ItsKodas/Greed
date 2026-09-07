import { value } from "@backroom/game-blackjack";
import type { TableView } from "@backroom/game-blackjack";
import { CODE_ALPHABET, CODE_LENGTH } from "@backroom/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../game/Avatar.js";
import { play } from "../game/audio.js";
import { Chat } from "../game/Chat.js";
import type { Account } from "../game/useAccount.js";
import { useAccount } from "../game/useAccount.js";
import { Navbar } from "../nav/Navbar.js";
import { PublicTables } from "../table/PublicTables.js";
import type { TableSocketHook } from "../table/useTableSocket.js";
import { useTableSocket } from "../table/useTableSocket.js";
import { Hand } from "./Cards.js";
import { Chip } from "./Chip.js";
import { ChipStack } from "./ChipStack.js";
import { useCardSound } from "./useCardSound.js";
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
  useCardSound(state, seatId);

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
      <Navbar
        game="Blackjack"
        {...(state !== null
          ? {
              table: {
                code: state.code,
                onLeave: table.leave,
                confirm: state.phase === "playing",
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
  // The hand you are actually being asked about, which after a split is one of
  // two — every control below acts on this one and not on the seat.
  const myHand = me?.hands[me.active];
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
              {/* Play money lives on the table and nowhere else, so the table
                  is the only place it can be shown. Real chips are in the bar
                  already and would only be a second, disagreeing copy. */}
              {state.forFun && seat.bet === 0 ? (
                <span className="bj__purse">{fmt(seat.purse)}</span>
              ) : null}
            </header>
            {/* One block per hand. Usually one; two after a split, and then
                the live one is marked, because "your turn" is no longer enough
                to say which cards you are being asked about. */}
            <div className="bj__hands">
              {seat.hands.map((hand, index) => (
                <div
                  // Position is the identity: hands are appended and never
                  // reordered, and two split hands can hold the same cards.
                  // biome-ignore lint/suspicious/noArrayIndexKey: hands are append-only
                  key={index}
                  className={`bj__hand${
                    seat.hands.length > 1 && state.turnSeatId === seat.id && seat.active === index
                      ? " bj__hand--live"
                      : ""
                  }`}
                >
                  <div className="bj__felt">
                    {/* What they have riding on it, as chips. A number says the
                        amount; a pile says the weight of it, which is what
                        anybody actually reads across a table. */}
                    {hand.bet > 0 ? <ChipStack amount={hand.bet} width={40} /> : null}
                    <Hand cards={hand.cards} />
                  </div>
                  <footer className={`bj__result${outcomeTone(hand.outcome)}`}>
                    {handLine(seat, hand, state.phase)}
                    {seat.hands.length > 1 && hand.bet > 0 ? (
                      <span className="bj__stake-small">{fmt(hand.bet)}</span>
                    ) : null}
                  </footer>
                </div>
              ))}
            </div>
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
          <Betting
            table={table}
            mine={me?.bet ?? 0}
            min={state.minBet}
            max={state.maxBet}
            isHost={isHost}
            seats={state.seats.length}
            listed={table.listed}
          />
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
              disabled={!myTurn || (myHand?.cards.length ?? 0) !== 2}
              onClick={() => table.act({ type: "double" })}
            >
              Double for {fmt(myHand?.bet ?? 0)}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              disabled={!myTurn || myHand === undefined || !splittable(myHand)}
              onClick={() => table.act({ type: "split" })}
            >
              Split for {fmt(myHand?.bet ?? 0)}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

/** What one hand's line says, which depends on how far it has got. */
function handLine(
  seat: TableView["seats"][number],
  hand: TableView["seats"][number]["hands"][number],
  phase: TableView["phase"],
): string {
  if (seat.waiting) {
    return "In on the next hand";
  }
  if (!seat.connected) {
    return "Dropped out";
  }
  if (hand.cards.length === 0) {
    if (phase !== "betting") {
      return "Sitting this one out";
    }
    return hand.bet > 0 ? "Ready" : "Yet to bet";
  }
  switch (hand.outcome) {
    case "blackjack":
      return `Blackjack — ${fmt(hand.returned)}`;
    case "won":
      return `Won ${fmt(hand.returned - hand.bet)}`;
    case "push":
      return `Push on ${hand.total}`;
    case "lost":
      return `Lost on ${hand.total}`;
    case "bust":
      return `Bust on ${hand.total}`;
    default:
      return hand.soft ? `Soft ${hand.total}` : String(hand.total);
  }
}

/** Whether a hand is two cards of the same value, and so may still be split. */
function splittable(hand: TableView["seats"][number]["hands"][number]): boolean {
  const [first, second] = hand.cards;
  if (hand.fromSplit || first === undefined || second === undefined || hand.cards.length !== 2) {
    return false;
  }
  // By value, not by rank: a king and a queen are a pair, which is the rule
  // the table plays by and so the rule the button has to agree with.
  return value([first]).total === value([second]).total;
}

function outcomeTone(
  outcome: TableView["seats"][number]["hands"][number]["outcome"],
): string {
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
  // Across every hand. A split that wins one and loses the other is one deal
  // with one answer, and reporting the halves separately would be two.
  const back = me.hands.reduce((total, hand) => total + hand.returned, 0);
  const net = back - me.bet;
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
  seats,
  listed,
}: {
  table: Table;
  mine: number;
  min: number;
  max: number;
  isHost: boolean;
  seats: number;
  listed: boolean;
}) {
  const stake = (amount: number) => {
    // Sounded on the press rather than on the state coming back: the whole
    // point of a chip sound is that it lands under your finger.
    play("bet");
    table.act({ type: "bet", amount });
  };

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
            title={`Add ${fmt(amount)}`}
            onClick={() => stake(mine + amount)}
          >
            <Chip amount={amount} />
          </button>
        ))}
      </div>
      {/* The pile you have built, beside the figure. The number is the exact
          answer; the stack is the one you can read without counting. */}
      <div className={`bj__stake${mine > 0 ? " bj__stake--on" : ""}`}>
        {mine > 0 ? (
          <>
            <ChipStack amount={mine} width={64} />
            <span className="bj__stake-total">{fmt(mine)}</span>
          </>
        ) : (
          <span>nothing yet — {fmt(min)} minimum</span>
        )}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--wide"
        disabled={mine === 0}
        onClick={() => stake(0)}
      >
        Take it back
      </button>
      {isHost ? (
        <>
          <button
            type="button"
            className="btn btn--wide"
            onClick={() => table.act({ type: "deal" })}
          >
            Deal
          </button>
          {/* Public by default: a table nobody can find is one you have to
              arrange before you can play at it. The code still works either
              way — private only means it is not advertised. */}
          <div className="bots">
            <span className="bots__label">Who can find it</span>
            <div className="bots__row">
              {[true, false].map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  role="radio"
                  aria-checked={listed === option}
                  className={`btn btn--small${listed === option ? "" : " btn--ghost"}`}
                  onClick={() => table.setListed(option)}
                >
                  {option ? "Public" : "Private"}
                </button>
              ))}
            </div>
          </div>
          {seats < 6 ? (
            <div className="bots">
              <span className="bots__label">Add a player</span>
              <div className="bots__row">
                {(["easy", "normal", "hard"] as const).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => table.addBot(skill)}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
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
  const guest = account.profile === null;
  const [typed, setTyped] = useState("");
  /*
   * A guest has no chips to stake, so their table is the play-money one. A
   * signed-in player is offered the choice and starts on the real thing,
   * which is what they came for.
   */
  const [forFun, setForFun] = useState(guest);
  /*
   * A signed-in player's name is the account's and the server will use it
   * whatever is sent here. A guest has none, so at a for-fun table they type
   * one — which is the only reason this field exists at all.
   */
  const name = account.profile?.name ?? typed.trim();
  const named = name.length > 0;

  return (
    <div className="join">
      <p className="join__pitch">
        Beat the dealer to twenty-one without going past it. Blackjack pays three to two, the
        dealer stands on seventeen.
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
          Playing for fun deals you five thousand chips that live at the table and nowhere else.
          Sign in to play for real ones.
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
          {/* Not gated on signing in: whether a guest may sit depends on the
              table, which only the server knows. It refuses in words. */}
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
                onClick={() => setForFun(option)}
              >
                <span className="variant__name">{option ? "For fun" : "For chips"}</span>
                <span className="variant__note">
                  {option
                    ? "Play money that lives at the table. Anybody can sit down."
                    : guest
                      ? "Sign in to play for real chips."
                      : "Real chips, from your balance."}
                </span>
              </button>
            ))}
          </div>

          <p className="panel__note">
            You get a five-character code to share. Six seats, everybody playing the dealer rather
            than each other.
          </p>
          <button
            type="button"
            className="btn btn--wide"
            disabled={table.busy || !named}
            onClick={() => table.create(name, { game: "blackjack", forFun })}
          >
            Open a table
          </button>
        </div>
      </div>

      <PublicTables
        game="blackjack"
        busy={table.busy}
        canSit={named}
        whyNotSit="Put in a name first."
        onJoin={(open) => table.join(name, open)}
        onWatch={(open) => table.watch(open)}
      />
    </div>
  );
}
