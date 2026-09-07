import type { Face } from "@backroom/game-slots";
import { jackpotPay, maxStake } from "@backroom/game-slots";
import type { SpinLine, SpinResult } from "@backroom/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DiscordIcon } from "../blackjack/Icons.js";
import { useAccount } from "../game/useAccount.js";
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

/**
 * A hundred credits to the chip.
 *
 * A display convention and nothing more. There is one ledger in this building
 * and it is in chips; the multiplication happens here, on the way to the
 * glass, because a machine that says 500 feels like a slot machine and one
 * that says 5 does not. Nothing underneath ever stores a credit.
 */
export const CREDITS_PER_CHIP = 100;

export function credits(chips: number): string {
  return (chips * CREDITS_PER_CHIP).toLocaleString("en-GB");
}

/** How long after the last reel stops before the winning lines light. */
export const LINE_LIGHT_MS = 420;

/** The reels, named so each keeps its identity across a spin. */
const REEL_NAMES = ["one", "two", "three", "four", "five"] as const;

/** The stakes on offer, before the bank's own ceiling is applied. */
const STAKES = [1, 2, 5, 10, 25, 50, 100] as const;

interface MachineSign {
  bank: number;
  maxStake: number;
  jackpot: number;
}

type SpinSocket = Socket<Record<string, never>, { "slots:spin": (payload: { stake: number }, ack: (result: SpinResult) => void) => void }>;

export default function Slots() {
  const account = useAccount();
  const [sign, setSign] = useState<MachineSign | null>(null);
  const [grid, setGrid] = useState<Face[][] | undefined>(undefined);
  const [lines, setLines] = useState<SpinLine[]>([]);
  const [lit, setLit] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [stake, setStake] = useState(5);
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

  const cap = sign?.maxStake ?? 0;
  const offered = STAKES.filter((amount) => amount <= cap);
  const balance = account.profile === null ? null : account.profile.chips - pending;
  const affordable = balance === null ? false : stake <= balance + pending && stake <= balance;
  const canPull = connected && !spinning && stake > 0 && stake <= cap && affordable;

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

    socket.emit("slots:spin", { stake }, (result) => {
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
      setSaid(
        result.jackpot
          ? `JACKPOT — ${credits(result.won)} credits`
          : result.won > 0
            ? `${credits(result.won)} credits`
            : null,
      );
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
        <BankSign bank={sign?.bank ?? 0} jackpot={sign?.jackpot ?? 0} />

        <div className="slots__glass">
          {columns.map((column, reel) => (
            <Reel
              // Five fixed positions; what changes is the faces in one of them.
              key={REEL_NAMES[reel]}
              column={column}
              spinning={spinning}
              index={reel}
            />
          ))}
          <PaylineOverlay lines={lit ? lines : []} />
        </div>

        <p className={`slots__said${said?.startsWith("JACKPOT") === true ? " slots__said--big" : ""}`} aria-live="polite">
          {said ?? " "}
        </p>

        {account.profile === null ? (
          <SignInToPlay available={account.available} />
        ) : (
          <Controls
            offered={offered}
            stake={stake}
            onStake={setStake}
            onPull={pull}
            canPull={canPull}
            spinning={spinning}
            balance={balance ?? 0}
            cap={cap}
          />
        )}
      </div>
    </main>
  );
}

/** What the machine is playing for, which is the reason to play it. */
function BankSign({ bank, jackpot }: { bank: number; jackpot: number }) {
  return (
    <div className="slots__bank">
      <span className="slots__bank-label">Jackpot</span>
      <strong className="slots__bank-figure">{credits(jackpot)}</strong>
      <span className="slots__bank-note">
        of {credits(bank)} in the bank — every credit of it staked by somebody
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

function Controls({
  offered,
  stake,
  onStake,
  onPull,
  canPull,
  spinning,
  balance,
  cap,
}: {
  offered: readonly number[];
  stake: number;
  onStake: (amount: number) => void;
  onPull: () => void;
  canPull: boolean;
  spinning: boolean;
  balance: number;
  cap: number;
}) {
  return (
    <div className="slots__controls">
      <div className="slots__stakes" role="radiogroup" aria-label="Credits per spin">
        {offered.length === 0 ? (
          <p className="slots__shut">
            The bank is empty, so there is nothing to play for yet. It fills as people play.
          </p>
        ) : (
          offered.map((amount) => (
            <button
              key={amount}
              type="button"
              role="radio"
              aria-checked={stake === amount}
              className={`btn btn--small${stake === amount ? "" : " btn--ghost"}`}
              onClick={() => onStake(amount)}
              disabled={amount > balance}
            >
              {credits(amount)}
            </button>
          ))
        )}
      </div>

      <button type="button" className="btn btn--wide slots__lever" onClick={onPull} disabled={!canPull}>
        {spinning ? "Spinning" : "Spin"}
      </button>

      <p className="slots__purse">
        <span>{credits(balance)} credits</span>
        {cap > 0 ? <span className="slots__cap">Max {credits(cap)} a spin</span> : null}
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
