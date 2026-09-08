import type { Face } from "@backroom/game-slots";
import {
  CHIPS,
  FUN_BANK,
  FUN_PURSE,
  jackpotPay,
  maxStake,
  MIN_STAKE,
  PAYLINES,
  runOn,
} from "@backroom/game-slots";
import type { SpinLine, SpinNews, SpinResult } from "@backroom/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DiscordIcon } from "../blackjack/Icons.js";
import { play, riser, startLoop } from "../game/audio.js";
import { Avatar } from "../game/Avatar.js";
import { Chip } from "../chips/Chip.js";
import { ChipStack } from "../chips/ChipStack.js";
import { useAccount } from "../game/useAccount.js";
import { exact } from "../game/money.js";
import { Navbar } from "../nav/Navbar.js";
import { Digits } from "./Digits.js";
import { Reel, REEL_STAGGER_MS } from "./Reel.js";
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

/**
 * How long a win is left to be looked at before the lever comes back.
 *
 * A machine that will take your next stake while it is still counting out the
 * last one is hurrying you past the only part worth watching. So the lever
 * stays down until the lines have lit and the coins have finished.
 */
export function celebrationMs(won: number, jackpot: boolean, lit: number): number {
  if (won <= 0) {
    return 0;
  }
  if (jackpot) {
    return 2600;
  }
  // The lines light one after another, so more of them is a longer look.
  return Math.min(2200, LINE_LIGHT_MS + 700 + lit * 90);
}

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

/**
 * How long the machine waits for an answer before giving up on it.
 *
 * Generous, because a slow reply is still a reply and throwing away a spin
 * that was about to land is worse than a long wait. But not forever: without
 * this the lever stays down and the machine is dead until the page is
 * reloaded, which is the one failure a player cannot work around.
 */
const PATIENCE_MS = 10_000;

/** How much longer a reel is held when the answer is still riding on it. */
export const HOLD_MS = 900;

/**
 * Which reels to take your time over.
 *
 * The server has already said what every reel holds, so nothing here is
 * guessed — this only chooses how long the machine takes to say it, which is
 * exactly what a real one does when the first three have come up sevens.
 *
 * Worth holding for: a big face already three across, or anything four across
 * with one reel left. Small faces three across are a win but not a moment.
 */
export function holdsFor(grid: Face[][]): number[] {
  let best = 0;
  for (const line of PAYLINES) {
    const { face, length } = runOn(grid, line);
    const worth = length >= 4 || (length >= 3 && (face === "seven" || face === "bell"));
    if (worth) {
      best = Math.max(best, length);
    }
  }
  // The deciding reel is the one the run has reached; hold it, and reel four
  // as well once the run is long enough to still be alive when it lands.
  return [0, 1, 2, 3, 4].map((reel) => (reel >= 3 && reel <= best ? HOLD_MS : 0));
}

/**
 * The figure the machine puts on its screen.
 *
 * Just the number: the screen labels it "Paid" or "Jackpot" above, so carrying
 * the word down here would print it twice.
 */
function sayWhat(won: number): string | null {
  return won > 0 ? exact(won) : null;
}

/** The tray, smallest first, because it reads left to right. */
const TRAY = [...CHIPS].reverse();

interface MachineSign {
  bank: number;
  maxStake: number;
  jackpot: number;
}

type SpinSocket = Socket<
  { "slots:spun": (news: SpinNews) => void },
  {
    "slots:spin": (
      payload: { stake: number; lines?: number; forFun?: boolean },
      ack: (result: SpinResult) => void,
    ) => void;
    "slots:watch": (payload: Record<string, never>, ack: (recent: SpinNews[]) => void) => void;
    "slots:away": () => void;
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
  /** What everybody else at the machine has been doing. */
  const [news, setNews] = useState<SpinNews[]>([]);
  /** How long each reel is being held, which is only ever a reveal. */
  const [holds, setHolds] = useState<number[]>([0, 0, 0, 0, 0]);
  /**
   * Whether the machine is pulling its own handle.
   *
   * Turns itself off the moment something pays, which is the whole point of
   * it: a machine left running through a win is one nobody watched win.
   */
  const [auto, setAuto] = useState(false);
  /**
   * Whether the row has settled.
   *
   * Kept apart from `settling` below, and that separation is the point: this
   * is the reels finishing, that is the whole pull finishing. Sharing one flag
   * is what made the winning lines wait for the payout they were supposed to
   * open.
   */
  const [stopped, setStopped] = useState(false);
  /**
   * Whether a pull is still playing out.
   *
   * Not the same as waiting on the server, and that difference is the whole
   * point of it: the answer lands long before the reels finish saying it, so a
   * lever that came back the moment the socket replied was live for two
   * seconds while the machine was visibly still spinning.
   *
   * Runs from the press to the last reel settling, and is what the lever and
   * the winning lines both wait on.
   */
  const [settling, setSettling] = useState(false);
  /**
   * How many of the nine lines are being bought.
   *
   * The chips on the tray are the bet *per line*, so this multiplies what
   * leaves the account. A line nobody bought does not pay however it lands,
   * which is the whole meaning of choosing fewer.
   */
  /*
   * Nothing chosen to start with. A machine that arrives with nine lines
   * already bought has made a decision about somebody's money before they
   * touched it — and nine is not a small one.
   */
  const [lineCount, setLineCount] = useState(0);
  /** Whether the spin on the glass was the jackpot, for what the belly says. */
  const [wasJackpot, setWasJackpot] = useState(false);
  /** Gives up on an answer that never comes, so the machine cannot lock. */
  const patience = useRef<number | null>(null);
  /** The spin loop and the rising note, so whatever started them can end them. */
  const reelsLoop = useRef<(() => void) | null>(null);
  const rising = useRef<(() => void) | null>(null);
  /** The result, kept for the moment the last reel finally settles. */
  const landed = useRef<{ won: number; jackpot: boolean; stake: number; lit: number } | null>(
    null,
  );
  const [said, setSaid] = useState<string | null>(null);
  /** Something refused. Separate from what a spin paid, and said straight away. */
  const [problem, setProblem] = useState<string | null>(null);
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
    socket.on("connect", () => {
      setConnected(true);
      // Stand at the machine. The backlog comes back with the ack, so the
      // wall is never briefly blank for somebody who has just walked up.
      socket.emit("slots:watch", {}, (recent) => setNews(recent));
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("slots:spun", (spun) => {
      setNews((seen) => [spun, ...seen].slice(0, 24));
    });
    return () => {
      socket.emit("slots:away");
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
  /*
   * What actually leaves the account: a bet on every line bought. The chips on
   * the tray are the bet *per line*, which is how a machine with selectable
   * lines has to work — otherwise choosing fewer would quietly make each one
   * worth more rather than making the spin cheaper.
   */
  const total = stake * lineCount;
  const canPull =
    connected &&
    !settling &&
    lineCount >= 1 &&
    stake >= MIN_STAKE &&
    total <= cap &&
    balance !== null &&
    total <= balance;

  /** Whether one more of this chip could go on: the bank's ceiling and yours. */
  /*
   * Costed against one line until lines are chosen, so the tray is usable
   * before the picker has been touched rather than either dead or lying.
   */
  const perSpin = (amount: number) => (stake + amount) * Math.max(1, lineCount);
  const canAdd = (amount: number) =>
    !settling && perSpin(amount) <= cap && balance !== null && perSpin(amount) <= balance;

  /**
   * Everything the machine is making a noise about, stopped.
   *
   * One place, called from every way a spin can end — settled, refused, mode
   * changed, page left. A loop is the one sound that does not stop itself, so
   * every exit has to go through here or the machine spins forever in the
   * dark.
   */
  const hush = useCallback(() => {
    reelsLoop.current?.();
    reelsLoop.current = null;
    rising.current?.();
    rising.current = null;
    if (patience.current !== null) {
      window.clearTimeout(patience.current);
      patience.current = null;
    }
  }, []);

  // Whatever is running, it does not outlive the page.
  useEffect(() => hush, [hush]);

  /**
   * Coins into the tray for a moment, then quiet.
   *
   * A loop rather than a burst of one-shots because a payout is one continuous
   * sound, and stopped on a timer because how long it runs is a question about
   * the size of the win rather than the length of the file.
   */
  const payingOut = useCallback((ms: number) => {
    const stop = startLoop("coins", 0.5);
    window.setTimeout(stop, ms);
  }, []);

  /** One reel has settled. */
  /**
   * One reel has settled.
   *
   * The last one hands over to the celebration rather than running it here:
   * the lines, the sound and the lever coming back are one sequence, and
   * scattering them across two places is how they drifted apart.
   */
  const reelStopped = useCallback(
    (index: number) => {
      play("reelStop");

      // The next reel is being held, which means the answer still rides on it.
      const next = holds[index + 1] ?? 0;
      if (next > 0 && rising.current === null) {
        rising.current = riser((next + REEL_STAGGER_MS) / 1000);
      }

      if (index < 4) {
        return;
      }
      // The last one. Everything that was running stops.
      hush();
      setStopped(true);
    },
    [holds, hush],
  );

  /*
   * What happens once the row has settled.
   *
   * Keyed on the reels stopping, and nothing else. It used to wait on
   * `settling`, which by then also covered the celebration — so the lines
   * waited for the whole payout to finish before they started, and lit a
   * second and a half after the sound that was supposed to accompany them.
   *
   * The beat before they light is deliberate: a row of reels that have only
   * just stopped needs a moment to be read before something is drawn over it.
   * The sound goes with the lines rather than ahead of them, because they are
   * the same event.
   */
  useEffect(() => {
    if (!stopped) {
      return;
    }
    /*
     * Read, not taken. An earlier version cleared this here, which made the
     * effect destroy its own input: React runs effects twice in development,
     * so the second pass found nothing, read the win as a loss and cancelled
     * the celebration. Every win was swallowed and the machine just carried on.
     *
     * `pull` clears it at the start of the next spin, which is the only place
     * that should.
     */
    const result = landed.current;
    if (result === null || result.won <= 0) {
      // Nothing to watch, so the lever comes straight back.
      setSettling(false);
      return;
    }

    // Something paid, so the machine stops pulling its own handle: a win the
    // player did not see happen is a win that did not happen to them.
    setAuto(false);

    const show = window.setTimeout(() => {
      setLit(true);

      /*
       * How the money arrives, sized to how much of it there is. A handful of
       * coins for an ordinary line, a run of them for something worth looking
       * up at — the same sound at the same length for both would make every
       * win feel identical, which is the one thing a payout must not do.
       */
      if (result.jackpot) {
        play("jackpot");
        play("bonus");
        payingOut(2400);
        return;
      }
      play("spinWin");
      if (result.won >= result.stake * 20) {
        // Not a bonus round — the machine has none. A flourish for a win big
        // enough to deserve one.
        play("bonus");
        payingOut(1400);
        return;
      }
      for (let coin = 0; coin < 3; coin += 1) {
        window.setTimeout(() => play("coin"), coin * 130 + Math.random() * 60);
      }
    }, LINE_LIGHT_MS);

    /*
     * Held down while the win plays out. Taking a stake over the top of a
     * payout hurries the player past the part they are here for.
     */
    const done = window.setTimeout(
      () => setSettling(false),
      LINE_LIGHT_MS + celebrationMs(result.won, result.jackpot, result.lit),
    );
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(done);
    };
  }, [stopped, payingOut]);

  /*
   * Held in a ref so the loop below does not restart on every render. `pull`
   * closes over the stake and the mode and is rebuilt constantly; watching it
   * would make the effect fire on its own.
   */
  const pullRef = useRef<() => void>(() => {});

  /*
   * The machine pulling its own handle.
   *
   * A beat between spins rather than straight into the next one — back to
   * back, the reels never visibly stop and it stops being a game being played
   * and becomes a screen doing something.
   *
   * It arms nothing on its own: any of the conditions that stop a person
   * spinning stop this too, because it goes through exactly the same canPull.
   */
  useEffect(() => {
    if (!auto || settling || !canPull) {
      return;
    }
    const next = window.setTimeout(() => pullRef.current(), 500);
    return () => window.clearTimeout(next);
  }, [auto, settling, canPull]);

  const changeMachine = (next: boolean) => {
    if (next === forFun || spinning) {
      return;
    }
    /*
     * A clean start at the other machine. Carrying the reels across would show
     * a result from a game that was not this one, and carrying the stake would
     * put chips on the felt of a machine the player has only just walked up to.
     */
    hush();
    setSettling(false);
    setAuto(false);
    setForFun(next);
    setStake(0);
    setGrid(undefined);
    setLines([]);
    setLit(false);
    setWasJackpot(false);
    setSaid(null);
    setProblem(null);
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
    setPending(total);
    setHolds([0, 0, 0, 0, 0]);
    setSettling(true);
    setStopped(false);
    landed.current = null;

    play("lever");
    /*
     * Under the whole spin, and stopped by whichever reel settles last.
     *
     * Seven tenths of where the one-shots sit. It is a bed rather than an
     * event: it runs for two solid seconds every pull, and anything loud
     * enough to notice becomes the thing you hear instead of the five reel
     * stops landing on top of it.
     */
    reelsLoop.current?.();
    reelsLoop.current = startLoop("reels", 0.32);

    /*
     * An answer that never comes. The house rule is that anything shown early
     * is given up on if the table never speaks — so the reels stop turning,
     * the stake goes back on the glass, and the lever comes up.
     */
    patience.current = window.setTimeout(() => {
      patience.current = null;
      hush();
      setSpinning(false);
      setSettling(false);
      setPending(0);
      setProblem("The machine did not answer. Nothing was staked.");
    }, PATIENCE_MS);

    socket.emit(
      "slots:spin",
      { stake: total, lines: lineCount, ...(forFun ? { forFun: true } : {}) },
      (result) => {
      if (patience.current !== null) {
        window.clearTimeout(patience.current);
        patience.current = null;
      }
      setSpinning(false);
      setPending(0);
      if (!result.ok) {
        // Refused: the stake was never taken, so the glass goes back to what
        // it was showing rather than sitting on a spin that did not happen —
        // and the machine stops making the noise of a spin.
        hush();
        setSettling(false);
        setProblem(result.error);
        readSign();
        return;
      }
      const grid = result.grid as Face[][];
      setGrid(grid);
      setLines(result.lines);
      /*
       * Set with the grid, in the same render, so the reels read their hold
       * before they schedule anything. A hold arriving a render later would be
       * a reel that had already decided when to stop.
       */
      setHolds(holdsFor(grid));
      setWasJackpot(result.jackpot);
      landed.current = {
        won: result.won,
        jackpot: result.jackpot,
        stake: total,
        lit: result.lines.length,
      };
      if (forFun) {
        setFunPurse(result.balance);
        setFunSign({
          bank: result.bank,
          maxStake: maxStake(result.bank),
          jackpot: jackpotPay(result.bank),
        });
        setSaid(sayWhat(result.won));
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
      setSaid(sayWhat(result.won));
    });
  };

  /*
   * The lines light after the last reel has settled, not with it. A win drawn
   * across reels that are still turning is a win the player cannot read.
   *
   * Hung off the reel actually stopping rather than off a sum of the timings.
   * The sum stopped being true the moment a reel could be held back: on a spin
   * with sevens up, the lines were lighting while the last reel was still
   * turning — giving away the answer the hold exists to withhold.
   */
  pullRef.current = pull;

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

      <div className="slots__floor">
        <SpinFeed
          title="At the machine"
          empty="Nobody has pulled it yet."
          news={news}
          side="left"
        />

        <div className="slots__cabinet">
          <ModeSwitch forFun={forFun} onChange={changeMachine} busy={settling} />

          {/*
            * The machine itself: a marquee over glass over a belly, with the
            * handle bolted down the side. Drawn as one object rather than a
            * stack of panels, because a slot machine is a thing you stand in
            * front of and everything on this page is part of it.
            */}
          <div className="cab">
            <div className="cab__body">
              <div className="cab__marquee">
                <Marquee
                  bank={shown?.bank ?? 0}
                  jackpot={shown?.jackpot ?? 0}
                  forFun={forFun}
                  said={said}
                  problem={problem}
                  lines={lines}
                  wasJackpot={wasJackpot}
                  showing={lit}
                />
              </div>

              <div className="cab__glass">
                <div className="slots__glass">
                  {columns.map((column, reel) => (
                    <Reel
                      // Five fixed positions; what changes is the faces in one.
                      key={REEL_NAMES[reel]}
                      column={column}
                      spinning={spinning}
                      index={reel}
                      resting={ATTRACT[reel]}
                      holdMs={holds[reel] ?? 0}
                      onStop={() => reelStopped(reel)}
                    />
                  ))}
                  <PaylineOverlay lines={lit ? lines : []} />
                </div>
              </div>

              <div className="cab__belly">
                {canPlay ? (
                  <Controls
                    stake={stake}
                    onAdd={(amount) => setStake((on) => on + amount)}
                    onClear={() => setStake(0)}
                    canAdd={canAdd}
                    busy={settling}
                    balance={balance ?? 0}
                    cap={cap}
                    forFun={forFun}
                    lineCount={lineCount}
                    onLines={setLineCount}
                    total={total}
                    onPull={pull}
                    canPull={canPull}
                    auto={auto}
                    onAuto={() => setAuto((on) => !on)}
                  />
                ) : (
                  <SignInToPlay available={account.available} />
                )}
              </div>

              {/* Where the coins would land. Empty, and that is the point: it
                  is the bottom edge of a machine rather than a panel. */}
              <div className="cab__tray" aria-hidden="true" />
            </div>

          </div>
        </div>

        <SpinFeed
          title="Paying out"
          empty="No wins yet."
          news={news.filter((spun) => spun.won > 0)}
          side="right"
        />
      </div>
    </main>
  );
}

/**
 * What other people are doing at the machine.
 *
 * Only chips spins reach here, so the wall is an honest picture of the room:
 * a for-fun purse was never anybody's, and counting it would advertise a
 * machine busier than it is.
 *
 * Two of these, either side. The left is everything as it happens and the
 * right is only what paid, so a quiet room still has one column with
 * something in it and a busy one reads twice over.
 */
function SpinFeed({
  title,
  empty,
  news,
  side,
}: {
  title: string;
  empty: string;
  news: SpinNews[];
  side: "left" | "right";
}) {
  return (
    <aside className={`feed feed--${side}`} aria-label={title}>
      <p className="feed__label">{title}</p>
      {news.length === 0 ? (
        <p className="feed__empty">{empty}</p>
      ) : (
        <ul className="feed__list">
          {news.slice(0, 8).map((spun) => (
            <li
              key={spun.id}
              className={`feed__row${spun.jackpot ? " feed__row--jackpot" : ""}`}
            >
              <Avatar name={spun.name} avatar={spun.avatar} accentColor={null} className="feed__face" />
              <span className="feed__who">{spun.name}</span>
              <span className="feed__sum">
                {spun.won > 0 ? (
                  <b className="feed__won">+{exact(spun.won - spun.stake)}</b>
                ) : (
                  <span className="feed__lost">-{exact(spun.stake)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * What paid, and for what.
 *
 * A figure on its own tells a player they won without telling them why, and a
 * slot machine that cannot be read is a slot machine nobody trusts. This is
 * the same information the reels are showing, in words: the run, the face, the
 * line it landed on, and what that came to.
 */
function WinBreakdown({ lines, jackpot }: { lines: SpinLine[]; jackpot: boolean }) {
  if (lines.length === 0 && !jackpot) {
    return null;
  }

  /*
   * Grouped by what actually happened rather than listed line by line.
   *
   * Three chips across can light six paylines at once, and six rows saying
   * "3 x Chip" one after another is the same sentence six times — it filled
   * the belly of the machine and said nothing the first row had not. The glass
   * is already showing *which* lines lit, so the words only have to say what
   * landed and what it came to.
   */
  const groups = new Map<string, { face: string; length: number; count: number; paid: number }>();
  for (const line of lines) {
    const key = `${line.face}-${line.length}`;
    const seen = groups.get(key) ?? { face: line.face, length: line.length, count: 0, paid: 0 };
    seen.count += 1;
    seen.paid += line.pay;
    groups.set(key, seen);
  }
  const best = [...groups.values()].sort((a, b) => b.paid - a.paid);

  return (
    <ul className="won">
      {jackpot ? (
        <li className="won__row won__row--jackpot">
          <span className="won__what">Five sevens — the jackpot</span>
        </li>
      ) : null}
      {best.map((group) => (
        <li className="won__row" key={`${group.face}-${group.length}`}>
          <span className="won__what">
            {group.length} × {group.face}
          </span>
          {group.count > 1 ? <span className="won__lines">on {group.count} lines</span> : null}
          <span className="won__pay">{exact(group.paid)}</span>
        </li>
      ))}
    </ul>
  );
}

/** An arrow curving back on itself: chips coming off the felt. */
function TakeBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="take__icon">
      <title>Take back</title>
      <path
        d="M20 17a7 7 0 0 0-7-7H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M9 5.5 4 10l5 4.5Z" fill="currentColor" />
    </svg>
  );
}

/** Two arrows chasing each other: the machine going round again. */
function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="auto__icon">
      <title>Repeat</title>
      <path
        d="M4 9a6 6 0 0 1 6-6h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M14 0.5 18.5 3 14 5.5Z" fill="currentColor" transform="translate(0 0)" />
      <path
        d="M20 15a6 6 0 0 1-6 6H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M10 18.5 5.5 21 10 23.5Z" fill="currentColor" />
    </svg>
  );
}

/** How many of the nine lines to buy. */
function LinePicker({
  lines,
  onChange,
  disabled,
  perLine,
}: {
  lines: number;
  onChange: (lines: number) => void;
  disabled: boolean;
  perLine: number;
}) {
  return (
    <div className="picker">
      <span className="picker__label">Lines</span>
      <div className="picker__row" role="radiogroup" aria-label="How many paylines">
        {[1, 3, 5, 9].map((count) => (
          <button
            key={count}
            type="button"
            role="radio"
            aria-checked={lines === count}
            className={`picker__pick${lines === count ? " picker__pick--on" : ""}`}
            disabled={disabled}
            onClick={() => onChange(count)}
          >
            {count}
          </button>
        ))}
      </div>
      {/* What it actually costs, because two numbers multiplied is exactly the
          sort of arithmetic a machine should not make anybody do. */}
      <span className={`picker__cost${lines === 0 ? " picker__cost--asking" : ""}`}>
        {lines === 0
          ? "Pick your lines"
          : `${exact(perLine)} a line — ${exact(perLine * lines)} a spin`}
      </span>
    </div>
  );
}

/**
 * The screen across the top of the machine.
 *
 * A status display rather than a jackpot sign. At rest it shows what there is
 * to play for, because that is the reason anybody is standing here; the moment
 * a spin says something it shows that instead, and goes back when the next
 * pull starts.
 *
 * One screen doing both is how a real cabinet works, and it is also the only
 * place on the machine a message can go without pushing the reels down the
 * page every time somebody wins.
 */
export function Marquee({
  bank,
  jackpot,
  forFun,
  said,
  problem,
  lines,
  wasJackpot,
  showing,
}: {
  bank: number;
  jackpot: number;
  forFun: boolean;
  /** What the last spin paid. Only ever shown once the reels have stopped. */
  said: string | null;
  /** Something refused, which may be said at any time. */
  problem: string | null;
  lines: SpinLine[];
  wasJackpot: boolean;
  /** Whether the reels have finished and the outcome may be shown. */
  showing: boolean;
}) {
  const outcome = showing && (lines.length > 0 || wasJackpot);
  /*
   * Kept apart from the outcome on purpose. The answer is in long before the
   * reels finish saying it, so a screen that printed the figure as soon as it
   * arrived would give away what the last reel is still hiding — which is the
   * one thing this machine must not do.
   */
  const message = problem !== null && !outcome;

  return (
    <div
      className={`screen${forFun ? " screen--fun" : ""}${wasJackpot && showing ? " screen--jackpot" : ""}`}
      aria-live="polite"
    >
      {outcome ? (
        <>
          <span className="screen__label">{wasJackpot ? "Jackpot" : "Paid"}</span>
          <strong className="screen__figure">
            <Digits value={said ?? "0"} />
          </strong>
          <WinBreakdown lines={lines} jackpot={wasJackpot} />
        </>
      ) : message ? (
        <>
          <span className="screen__label">The machine says</span>
          <p className="screen__note screen__note--said">{problem}</p>
        </>
      ) : (
        <>
          <span className="screen__label">Jackpot</span>
          <strong className="screen__figure">
            <Digits value={exact(jackpot)} />
          </strong>
          <p className="screen__note">
            {forFun
              ? `of ${exact(bank)} in the bank — play money, and none of it anybody's`
              : bank === 0
                ? "The bank has not been stocked yet, so the machine is shut."
                : `of ${exact(bank)} in the bank — every chip of it staked by somebody`}
          </p>
        </>
      )}
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
  busy,
  balance,
  cap,
  forFun,
  lineCount,
  onLines,
  total,
  onPull,
  canPull,
  auto,
  onAuto,
}: {
  stake: number;
  onAdd: (amount: number) => void;
  onClear: () => void;
  canAdd: (amount: number) => boolean;
  busy: boolean;
  balance: number;
  cap: number;
  forFun: boolean;
  lineCount: number;
  onLines: (lines: number) => void;
  total: number;
  onPull: () => void;
  canPull: boolean;
  auto: boolean;
  onAuto: () => void;
}) {
  /* What one more of a chip would make the whole spin cost. */
  const perSpin = (amount: number) => (stake + amount) * Math.max(1, lineCount);

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
      <LinePicker lines={lineCount} onChange={onLines} disabled={busy} perLine={stake} />

      <div className="slots__tray" data-quiet>
        {TRAY.map((amount) => (
          <button
            key={amount}
            type="button"
            className="slots__chip"
            disabled={!canAdd(amount)}
            title={
              perSpin(amount) > cap
                ? `The bank cannot cover ${exact(perSpin(amount))} yet`
                : `Add ${exact(amount)} a line`
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
        {stake > 0 && lineCount > 0 ? (
          <>
            <ChipStack amount={total} width={64} />
            <span className="slots__bet-total">{exact(total)}</span>
            {/* An icon rather than a sentence: it sits in a row of chips and
                a figure, and a line of underlined text in among them read as
                something borrowed from a different page. */}
            <button
              type="button"
              className="take"
              onClick={onClear}
              disabled={busy}
              title="Take your chips back off the felt"
              aria-label="Take your chips back off the felt"
            >
              <TakeBackIcon />
            </button>
          </>
        ) : (
          <span className="slots__bet-empty">
            {stake > 0 && lineCount === 0
              ? `${exact(stake)} a line — choose how many`
              : `nothing on yet — ${exact(MIN_STAKE)} a line minimum`}
          </span>
        )}
      </div>

      {/*
        * The button, set into the machine rather than laid on the page.
        *
        * Chunky on purpose: it has a side face you can see, it goes down when
        * pressed and springs back past its own height on release. That is the
        * whole trick — a flat rectangle that changes colour is a link, and
        * this is the thing you hit to make the machine go.
        */}
      <div className="slots__go">
        <button
          type="button"
          className={`spin${busy ? " spin--going" : ""}`}
          onClick={onPull}
          disabled={!canPull}
        >
          <span className="spin__face">{busy ? "Spinning" : "Spin"}</span>
        </button>

        {/* Beside the handle, not instead of it: this arms the same press. */}
        <button
          type="button"
          className={`auto${auto ? " auto--on" : ""}`}
          aria-pressed={auto}
          title={auto ? "Stop spinning on its own" : "Keep spinning until something pays"}
          onClick={onAuto}
        >
          <RepeatIcon />
          <span className="auto__word">Auto</span>
        </button>
      </div>

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
