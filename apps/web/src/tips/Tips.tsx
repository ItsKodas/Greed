import { REFUSALS } from "@backroom/game-tips";
import type { JarView, TapResult } from "@backroom/shared";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DiscordIcon } from "../blackjack/Icons.js";
import { exact } from "../game/money.js";
import { useAccount } from "../game/useAccount.js";
import { Navbar } from "../nav/Navbar.js";
import { Jar } from "./Jar.js";
import { Upgrades } from "./Upgrades.js";
import "@backroom/game-tips/theme.css";

/**
 * The bar's corner: a jar you tap, and nothing else asking to be watched.
 *
 * The only single-player room in the building that is not playing against a
 * bank — nothing here is staked, so there is no win to come from anybody but
 * the bar itself. What it teaches instead is the building's other rule: a
 * press lands before the table can possibly have answered it.
 */

type TipsSocket = Socket<
  Record<string, never>,
  {
    "tips:open": (payload: Record<string, never>, ack: (jar: JarView) => void) => void;
    "tips:tap": (payload: { token: string }, ack: (result: TapResult) => void) => void;
    "tips:buy": (
      payload: { upgrade: string; token: string },
      ack: (result: TapResult) => void,
    ) => void;
  }
>;

/**
 * How long there is left to tease before an answer that never comes is given
 * up on. A tap already went down on the glass the moment it was pressed, so
 * abandoning it too quickly would take back a scoop that may yet still land;
 * waiting forever would leave the jar quietly lying about what it holds.
 */
const PATIENCE_MS = 10_000;

/**
 * Chips in the jar right now, derived the way the server derives it — from
 * the level a moment ago, that moment, and the trickle since. This is
 * deriving, not inventing: the same arithmetic, run against numbers the last
 * ack already handed over, is what lets a press answer itself before the
 * round trip that would otherwise confirm it.
 */
function levelNow(jar: JarView, now: number): number {
  if (jar.level >= jar.brim) {
    return jar.level;
  }
  const elapsed = Math.max(0, now - jar.at);
  return Math.min(jar.brim, jar.level + (jar.trickle * elapsed) / 60_000);
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function Tips() {
  const account = useAccount();

  /*
   * Which room you are standing in, on the document rather than this
   * element: the page's background lives on body, so a game repainting only
   * its own subtree sits in the building's colours with nothing of its own.
   */
  useEffect(() => {
    document.documentElement.dataset["game"] = "tips";
    return () => {
      delete document.documentElement.dataset["game"];
    };
  }, []);

  const [jar, setJar] = useState<JarView | null>(null);
  const jarRef = useRef<JarView | null>(null);
  jarRef.current = jar;

  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Bumped once per accepted tap, so the jar wobbles exactly once each. */
  const [tapped, setTapped] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(0);

  const socketRef = useRef<TipsSocket | null>(null);
  /**
   * The last jar an ack actually confirmed.
   *
   * What an answer that never comes is given up back to: taps sent and not
   * yet heard from are only ever a guess about what the server will say, so
   * abandoning the queue has to land somewhere the server has actually said
   * was true.
   */
  const confirmedRef = useRef<JarView | null>(null);
  /**
   * Taps and buys, sent one at a time.
   *
   * The token is a compare-and-swap key the server rotates on every answer,
   * refusals included — so two requests in flight at once would race for it,
   * and the loser would come back refused for a reason that has nothing to do
   * with what it actually asked. Queuing rather than firing in parallel is
   * what keeps every request carrying a token that is still good.
   */
  const queueRef = useRef<Array<() => void>>([]);
  const sendingRef = useRef(false);
  const patienceRef = useRef<number | null>(null);

  const clearPatience = () => {
    if (patienceRef.current !== null) {
      window.clearTimeout(patienceRef.current);
      patienceRef.current = null;
    }
  };

  /** An answer landed, refusal or not: the jar it carries is now the truth. */
  const applyResult = (result: TapResult) => {
    clearPatience();
    confirmedRef.current = result.jar;
    jarRef.current = result.jar;
    setJar(result.jar);
    if (result.ok) {
      setMessage(null);
      account.setChips(result.balance);
    } else {
      setMessage(result.error);
    }
  };

  const pump = () => {
    if (sendingRef.current) {
      return;
    }
    const next = queueRef.current.shift();
    if (next === undefined) {
      return;
    }
    sendingRef.current = true;
    patienceRef.current = window.setTimeout(() => {
      // The house rule: anything shown early is given up on if the table
      // never speaks. Everything still queued is abandoned with it — a
      // second tap that went down while the first was already stuck is no
      // more trustworthy than the first was.
      queueRef.current = [];
      sendingRef.current = false;
      patienceRef.current = null;
      const confirmed = confirmedRef.current;
      jarRef.current = confirmed;
      setJar(confirmed);
      setMessage("The jar did not answer. Nothing was taken.");
    }, PATIENCE_MS);
    next();
  };

  const enqueue = (action: () => void) => {
    queueRef.current.push(action);
    pump();
  };

  useEffect(() => {
    const socket = io("", { withCredentials: true }) as TipsSocket;
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("tips:open", {}, (view) => {
        confirmedRef.current = view;
        jarRef.current = view;
        setJar(view);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    return () => {
      socket.close();
      socketRef.current = null;
      // A round trip still out when the page is left is one nobody is
      // waiting on any more — the timer that would otherwise fire on an
      // unmounted page is cleared here rather than left to run down. Cleared
      // inline rather than through `clearPatience`: that closure is recreated
      // every render and this effect only ever wants to run once, on mount.
      if (patienceRef.current !== null) {
        window.clearTimeout(patienceRef.current);
        patienceRef.current = null;
      }
      queueRef.current = [];
      sendingRef.current = false;
    };
  }, []);

  /*
   * The creep: the one thing on this page genuinely still happening, so the
   * one thing allowed to animate continuously. With motion off there is no
   * loop — the level is only ever redrawn on a tap or an ack, which turns the
   * creep into a step instead of taking it away outright.
   */
  const [reducedMotion] = useState(prefersReducedMotion);
  useEffect(() => {
    if (jar === null) {
      return;
    }
    if (reducedMotion) {
      setDisplayLevel(levelNow(jar, Date.now()));
      return;
    }
    let frame = 0;
    const tick = () => {
      const current = jarRef.current ?? jar;
      setDisplayLevel(levelNow(current, Date.now()));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [jar, reducedMotion]);

  const doTap = () => {
    const socket = socketRef.current;
    const current = jarRef.current;
    if (socket === null || current === null) {
      return;
    }
    const now = Date.now();
    const level = levelNow(current, now);
    const pay = Math.floor(Math.min(current.scoop, level));
    if (pay < 1) {
      // The client can already tell the jar is dry from the same numbers the
      // server would use — not a guess, the same arithmetic — so this is said
      // at once rather than sent off to be refused for the same reason.
      setMessage(REFUSALS.dry);
      return;
    }
    setMessage(null);
    setTapped((n) => n + 1);
    // The press, shown before the table can possibly have answered it.
    const optimistic: JarView = {
      ...current,
      level: level - pay,
      at: now,
      chipsTonight: current.chipsTonight + pay,
    };
    jarRef.current = optimistic;
    setJar(optimistic);

    enqueue(() => {
      // Read fresh rather than closed over: by the time this actually sends,
      // an earlier queued action may have already moved the token on.
      const token = jarRef.current?.token ?? current.token;
      socket.emit("tips:tap", { token }, (result) => {
        applyResult(result);
        sendingRef.current = false;
        pump();
      });
    });
  };

  const doBuy = (id: string) => {
    const socket = socketRef.current;
    if (socket === null || jarRef.current === null) {
      return;
    }
    enqueue(() => {
      const token = jarRef.current?.token ?? "";
      socket.emit("tips:buy", { upgrade: id, token }, (result) => {
        applyResult(result);
        sendingRef.current = false;
        pump();
      });
    });
  };

  return (
    <main className="tips" data-game="tips">
      <Navbar
        game={
          <>
            TIP <em>J</em>AR
          </>
        }
        account={account}
        connected={connected}
      />

      {account.loading ? null : account.profile === null ? (
        <SignInToTap available={account.available} />
      ) : jar === null ? (
        <p className="tips__loading">Walking over to the bar&hellip;</p>
      ) : (
        <div className="tips__floor">
          <Jar level={displayLevel} brim={jar.brim} onTap={doTap} tapped={tapped} disabled={false} />

          {/* Said, not proven — a message here is a courtesy, never the rule
              the server just applied. */}
          <p className="tips__said" role="status" aria-live="polite">
            {message}
          </p>

          <div className="tips__figures">
            <p className="tips__figure">
              <span className="tips__figure-label">Tonight</span>
              <b className="tips__figure-value" data-testid="tonight">
                {exact(jar.chipsTonight)}
              </b>
            </p>
            <p className="tips__figure">
              <span className="tips__figure-label">Favours</span>
              <b className="tips__figure-value" data-testid="favours">
                {exact(jar.favours)}
              </b>
            </p>
          </div>

          <Upgrades bought={jar.bought} favours={jar.favours} onBuy={doBuy} />
        </div>
      )}
    </main>
  );
}

/**
 * A jar you have to be somebody to tap.
 *
 * The jar lives on an account, so there is one step before the glass. Not a
 * refusal — the same one step every other chips game asks for.
 */
function SignInToTap({ available }: { available: boolean }) {
  return (
    <div className="panel gate tips__gate">
      <h2 className="gate__title">The jar keeps a tab</h2>
      <p className="gate__note">
        What you tap goes to an account, so there is one step before you can. Sign in and you
        will land back here.
      </p>
      {available ? (
        <a className="btn btn--wide btn--icon gate__in" href="/auth/discord?to=%2Ftips">
          <DiscordIcon />
          <span>Sign in with Discord</span>
        </a>
      ) : (
        <p className="panel__note">Signing in is not set up on this server.</p>
      )}
    </div>
  );
}
