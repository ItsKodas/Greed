import type { Face } from "@backroom/game-slots";
import { CHIPS, FUN_BANK, FUN_PURSE, jackpotPay, maxStake, MIN_STAKE } from "@backroom/game-slots";
import type { SpinLine, SpinResult } from "@backroom/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DiscordIcon } from "../blackjack/Icons.js";
import { Chip } from "../chips/Chip.js";
import { ChipStack } from "../chips/ChipStack.js";
import { useAccount } from "../game/useAccount.js";
import { exact } from "../game/money.js";
import { Navbar } from "../nav/Navbar.js";
import { Reel, REEL_STAGGER_MS, SPIN_UP_MS } from "./Reel.js";
import "@backroom/game-slots/theme.css";
import "./slots.css";

/**
 * The machine against the wall.
 *
 * The only game in the building played alone, and the only one allowed to be:
 * it pays from a bank that players alone fill, so a win here still comes from
 * real people — everybody who pulled the lever before you.
 */

/*
 * Everything on this cabinet is chips.
 *
 * It read in credits at a hundred to the chip for a while, on the argument
 * that a machine saying 500 feels more like a slot machine than one saying 5.
 * That argument is not worth what it costs: a player cannot tell what they are
 * playing for when the stake and the prize are in different units, and the
 * moment any figure here is a chip they all have to be. Chips are what the
 * rest of the building counts in, so chips it is.
 */

/** How long after the last reel stops before the winning lines light. */
export const LINE_LIGHT_MS = 420;

/** The reels, named so each keeps its identity across a spin. */
const REEL_NAMES = ["one", "two", "three", "four", "five"] as const;

/**
 * What the cabinet shows before anybody has pulled anything.
 *
 * Not a result, and it cannot be mistaken for one: neighbouring reels are
 * drawn from two disjoint sets of faces, so no run of two can start anywhere
 * on any payline, let alone a run of three. Dimmed by the stylesheet, with
 * nothing lit and nothing said.
 */
const ATTRACT: Face[][] = [
  ["chip", "dice", "spade"],
  ["horseshoe", "bell", "seven"],
  ["spade", "chip", "dice"],
  ["seven", "horseshoe", "bell"],
  ["dice", "spade", "chip"],
];

/** What the machine says it just did. */
function sayWhat(jackpot: boolean, won: number): string | null {
  if (jackpot) {
    return `JACKPOT — ${exact(won)} chips`;
  }
  return won > 0 ? `${exact(won)} chips` : null;
}

/** The tray, smallest first, because it reads left to right. */
const TRAY = [...CHIPS].reverse();

interface MachineSign {
  bank: number;
  maxStake: number;
  jackpot: number;
}

type SpinSocket = Socket<
  Record<string, never>,
  {
    "slots:spin": (
      payload: { stake: number; forFun?: boolean },
      ack: (result: SpinResult) => void,
    ) => void;
  }
>;

/** What a machine playing for nothing shows before its first pull. */
const FUN_SIGN: MachineSign = {
  bank: FUN_BANK,
  maxStake: maxStake(FUN_BANK),
  jackpot: jackpotPay(FUN_BANK),
};

export default function Slots() {
  const account = useAccount();
  /*
   * Which room you are standing in, on the document rather than this element:
   * the page's background and its haze live on body, so a game repainting only
   * its own subtree sits in the building's blue with a violet rectangle in it.
   */
  useEffect(() => {
    document.documentElement.dataset["game"] = "slots";
    return () => {
      delete document.documentElement.dataset["game"];
    };
  }, []);

  const [sign, setSign] = useState<MachineSign | null>(null);
  const [grid, setGrid] = useState<Face[][] | undefined>(undefined);
  const [lines, setLines] = useState<SpinLine[]>([]);
  const [lit, setLit] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [stake, setStake] = useState(0);
  /** Which machine: the one that pays chips, or the one that pays nothing. */
  const [forFun, setForFun] = useState(false);
  /** The play purse, which lives at the machine and never sees an account. */
  const [funPurse, setFunPurse] = useState(FUN_PURSE);
  const [funSign, setFunSign] = useState<MachineSign>(FUN_SIGN);
  const [said, setSaid] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  /*
   * The stake, gone from the shown balance the moment it is pressed.
   *
   * A stake is the player's own number, so it can be shown at once — unlike
   * anything the reels say, which is only the server's to tell. Cleared when
   * the answer lands and the real balance replaces it.
   */
  const [pending, setPending] = useState(0);
  const socketRef = useRef<SpinSocket | null>(null);

  useEffect(() => {
    const socket = io("", { withCredentials: true }) as SpinSocket;
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const readSign = useCallback(() => {
    void fetch("/api/slots")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: MachineSign | null) => {
        if (body !== null) {
          setSign(body);
        }
      })
      .catch(() => {
        // A sign that will not answer keeps whatever it last said. There is
        // nothing a player could do about it either way.
      });
  }, []);

  useEffect(() => {
    readSign();
    // Somebody else's jackpot changes this number, so it should not need a
    // refresh to notice.
    const timer = window.setInterval(readSign, 15_000);
    return () => window.clearInterval(timer);
  }, [readSign]);

  const shown = forFun ? funSign : sign;
  const cap = shown?.maxStake ?? 0;
  const balance = forFun
    ? funPurse - pending
    : account.profile === null
      ? null
      : account.profile.chips - pending;
  const canPull =
    connected && !spinning && stake >= MIN_STAKE && stake <= cap && balance !== null && stake <= balance;

  /** Whether one more of this chip could go on: the bank's ceiling and yours. */
  const canAdd = (amount: number) =>
    !spinning && stake + amount <= cap && balance !== null && stake + amount <= balance;

  const changeMachine = (next: boolean) => {
    if (next === forFun || spinning) {
      return;
    }
    /*
     * A clean start at the other machine. Carrying the reels across would show
     * a result from a game that was not this one, and carrying the stake would
     * put chips on the felt of a machine the player has only just walked up to.
     */
    setForFun(next);
    setStake(0);
    setGrid(undefined);
    setLines([]);
    setLit(false);
    setSaid(null);
  };

  const pull = () => {
    const socket = socketRef.current;
    if (socket === null || !canPull) {
      return;
    }
    /*
     * Everything the player chose, shown on the press. The reels start
     * turning, the stake leaves the balance, and nothing here guesses at a
     * face — the reels show a blur until the server says what stopped where.
     */
    setSpinning(true);
    setGrid(undefined);
    setLines([]);
    setLit(false);
    setSaid(null);
    setPending(stake);

    socket.emit("slots:spin", { stake, ...(forFun ? { forFun: true } : {}) }, (result) => {
      setSpinning(false);
      setPending(0);
      if (!result.ok) {
        // Refused: the stake was never taken, so the glass goes back to what
        // it was showing rather than sitting on a spin that did not happen.
        setSaid(result.error);
        readSign();
        return;
      }
      setGrid(result.grid as Face[][]);
      setLines(result.lines);
      if (forFun) {
        setFunPurse(result.balance);
        setFunSign({
          bank: result.bank,
          maxStake: maxStake(result.bank),
          jackpot: jackpotPay(result.bank),
        });
        setSaid(sayWhat(result.jackpot, result.won));
        return;
      }
      /*
       * Recomputed here from the arithmetic the server used rather than
       * hard-coded, so the sign cannot drift from the cap. The server is still
       * the authority — it checks the stake itself and refuses one it cannot
       * cover; this only decides what to offer.
       */
      setSign({
        bank: result.bank,
        maxStake: maxStake(result.bank),
        jackpot: jackpotPay(result.bank),
      });
      account.setChips(result.balance);
      setSaid(sayWhat(result.jackpot, result.won));
    });
  };

  /*
   * The lines light after the last reel has settled, not with it. A win drawn
   * across reels that are still turning is a win the player cannot read.
   */
  useEffect(() => {
    if (lines.length === 0) {
      return;
    }
    const settles = SPIN_UP_MS + REEL_STAGGER_MS * 4 + LINE_LIGHT_MS;
    const timer = window.setTimeout(() => setLit(true), settles);
    return () => window.clearTimeout(timer);
  }, [lines]);

  const columns: (Face[] | undefined)[] = [0, 1, 2, 3, 4].map((reel) => grid?.[reel]);
  // Signed in, or playing for nothing — either way there is a machine to play.
  const canPlay = forFun || account.profile !== null;

  return (
    <main className="slots" data-game="slots">
      <Navbar
        game={
          <>
            SL<em>O</em>TS
          </>
        }
        account={account}
        connected={connected}
      />

      <div className="slots__cabinet">
        <ModeSwitch forFun={forFun} onChange={changeMachine} busy={spinning} />
        <BankSign bank={shown?.bank ?? 0} jackpot={shown?.jackpot ?? 0} forFun={forFun} />

        <div className="slots__glass">
          {columns.map((column, reel) => (
            <Reel
              // Five fixed positions; what changes is the faces in one of them.
              key={REEL_NAMES[reel]}
              column={column}
              spinning={spinning}
              index={reel}
              resting={ATTRACT[reel]}
            />
          ))}
          <PaylineOverlay lines={lit ? lines : []} />
        </div>

        <p className={`slots__said${said?.startsWith("JACKPOT") === true ? " slots__said--big" : ""}`} aria-live="polite">
          {said ?? " "}
        </p>

        {canPlay ? (
          <Controls
            stake={stake}
            onAdd={(amount) => setStake((on) => on + amount)}
            onClear={() => setStake(0)}
            canAdd={canAdd}
            onPull={pull}
            canPull={canPull}
            spinning={spinning}
            balance={balance ?? 0}
            cap={cap}
            forFun={forFun}
          />
        ) : (
          <SignInToPlay available={account.available} />
        )}
      </div>
    </main>
  );
}

/** What the machine is playing for, which is the reason to play it. */
function BankSign({
  bank,
  jackpot,
  forFun,
}: {
  bank: number;
  jackpot: number;
  forFun: boolean;
}) {
  return (
    <div className={`slots__bank${forFun ? " slots__bank--fun" : ""}`}>
      <span className="slots__bank-label">Jackpot</span>
      {/*
        * In full, never shortened. This is the one number on the page somebody
        * is here for, and "19.9K" is a rounder answer to "what am I playing
        * for" than the question deserves.
        */}
      <strong className="slots__bank-figure">{exact(jackpot)}</strong>
      <span className="slots__bank-note">
        {forFun
          ? `of ${exact(bank)} in the bank — play money, and none of it anybody's`
          : bank === 0
            ? "The bank has not been stocked yet, so the machine is shut."
            : `of ${exact(bank)} in the bank — every chip of it staked by somebody`}
      </span>
    </div>
  );
}

/**
 * The winning lines, drawn only as far as each run actually reached.
 *
 * A line drawn the whole width for a run of three is the machine claiming a
 * win the player cannot see on the glass, which is worse than not drawing one.
 */
export function PaylineOverlay({ lines }: { lines: SpinLine[] }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <svg
      className="paylines"
      viewBox="0 0 500 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.map((line) => (
        <polyline
          key={line.line}
          className="payline"
          data-line={line.line}
          data-length={line.length}
          points={pointsFor(line)}
          style={{ animationDelay: `${line.line * 90}ms` }}
        />
      ))}
    </svg>
  );
}

/** The nine lines, in the overlay's own coordinates. */
const OVERLAY_LINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

function pointsFor(line: SpinLine): string {
  const rows = OVERLAY_LINES[line.line] ?? OVERLAY_LINES[0] ?? [];
  return rows
    .slice(0, line.length)
    .map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`)
    .join(" ");
}

/** Which machine you are standing at. */
function ModeSwitch({
  forFun,
  onChange,
  busy,
}: {
  forFun: boolean;
  onChange: (forFun: boolean) => void;
  busy: boolean;
}) {
  return (
    <div className="slots__modes" role="radiogroup" aria-label="What this machine plays for">
      {[false, true].map((fun) => (
        <button
          key={fun ? "fun" : "chips"}
          type="button"
          role="radio"
          aria-checked={forFun === fun}
          className={`slots__mode${forFun === fun ? " slots__mode--on" : ""}`}
          // Not mid-spin: the reels are answering a question this would change.
          disabled={busy}
          onClick={() => onChange(fun)}
        >
          {fun ? "For fun" : "For chips"}
        </button>
      ))}
    </div>
  );
}

/**
 * The tray, the bet, and the lever.
 *
 * Chips are built up rather than picked from, the way they are at a card
 * table: press the hundred four times and four hundred is on. It is the same
 * gesture in both rooms, and it is the one that lets somebody make a stake the
 * house never thought to offer.
 *
 * A stake stays put between spins, because a slot machine keeps your bet.
 */
function Controls({
  stake,
  onAdd,
  onClear,
  canAdd,
  onPull,
  canPull,
  spinning,
  balance,
  cap,
  forFun,
}: {
  stake: number;
  onAdd: (amount: number) => void;
  onClear: () => void;
  canAdd: (amount: number) => boolean;
  onPull: () => void;
  canPull: boolean;
  spinning: boolean;
  balance: number;
  cap: number;
  forFun: boolean;
}) {
  if (cap < MIN_STAKE) {
    return (
      <p className="slots__shut">
        The bank cannot cover a {exact(MIN_STAKE)} spin yet. It needs{" "}
        {exact(MIN_STAKE * 1296)} in it before the smallest chip goes on.
      </p>
    );
  }

  return (
    <div className="slots__controls">
      <div className="slots__tray" data-quiet>
        {TRAY.map((amount) => (
          <button
            key={amount}
            type="button"
            className="slots__chip"
            disabled={!canAdd(amount)}
            title={
              amount > cap
                ? `The bank cannot cover ${exact(amount)} yet`
                : `Add ${exact(amount)}`
            }
            onClick={() => onAdd(amount)}
          >
            <Chip amount={amount} size={54} />
          </button>
        ))}
      </div>

      {/* The pile you have built, beside the figure. The number is the exact
          answer; the stack is the one you can read without counting. */}
      <div className={`slots__bet${stake > 0 ? " slots__bet--on" : ""}`}>
        {stake > 0 ? (
          <>
            <ChipStack amount={stake} width={64} />
            <span className="slots__bet-total">{exact(stake)}</span>
            <button type="button" className="slots__take" onClick={onClear} disabled={spinning}>
              Take it back
            </button>
          </>
        ) : (
          <span className="slots__bet-empty">
            nothing on yet — {exact(MIN_STAKE)} minimum
          </span>
        )}
      </div>

      <button
        type="button"
        className={`slots__lever${spinning ? " slots__lever--going" : ""}`}
        onClick={onPull}
        disabled={!canPull}
      >
        <span className="slots__lever-face">{spinning ? "Spinning" : "Spin"}</span>
      </button>

      <p className="slots__purse">
        <span>
          {exact(balance)} {forFun ? "play chips" : "chips"}
        </span>
        <span className="slots__cap">Max {exact(cap)} a spin</span>
      </p>
    </div>
  );
}

/**
 * A machine you have to be somebody to play.
 *
 * Chips come from an account, and this one pays in them. Not a refusal — the
 * one step between them and the lever.
 */
function SignInToPlay({ available }: { available: boolean }) {
  return (
    <div className="panel gate slots__gate">
      <h2 className="gate__title">This one plays for chips</h2>
      <p className="gate__note">
        The bank is real chips other people staked, so there is one step before you pull the
        lever. Sign in and you will land back here.
      </p>
      {available ? (
        <a className="btn btn--wide btn--icon gate__in" href="/auth/discord?to=%2Fslots">
          <DiscordIcon />
          <span>Sign in with Discord</span>
        </a>
      ) : (
        <p className="panel__note">Signing in is not set up on this server.</p>
      )}
    </div>
  );
}
