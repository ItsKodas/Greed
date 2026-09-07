import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../game/Avatar.js";
import { Sign } from "../game/Sign.js";
import type { Account } from "../game/useAccount.js";
import { Sound } from "./Sound.js";

/** The table you are sitting at, when you are sitting at one. */
export interface NavTable {
  code: string;
  onLeave: () => void;
  /** Set while a game is running, so leaving asks once before forfeiting. */
  confirm?: boolean;
}

export interface NavbarProps {
  /**
   * The game's name as it is written — Greed sets one letter alight, so this
   * is markup rather than a string. Absent in the room and on your own page.
   */
  game?: ReactNode;
  table?: NavTable;
  account: Account;
  /**
   * Whether the socket is up. Undefined on pages with no socket at all, which
   * is different from being disconnected and shows nothing rather than a fault.
   */
  connected?: boolean;
}

/**
 * The bar across the top of every page.
 *
 * One component rather than a header per page, because a building with a
 * different bar in each room is not one building. Everything in it is either
 * the building's (the sign, your face, your chips, the sound) or this table's
 * (the game, the code, the way out) — and the second half simply is not there
 * when you are not at a table.
 */
export function Navbar({ game, table, account, connected }: NavbarProps) {
  return (
    <header className="nav">
      <h1 className="nav__mark">
        <Link to="/" aria-label="The Back Room">
          <Sign />
        </Link>
      </h1>
      {game !== undefined ? <span className="nav__game">{game}</span> : null}

      <span className="nav__spacer" />

      {/* The table you are at, as one object — the same shape as the account
          beside it, because both are a thing you are in rather than a control.
          Leaving lives inside it: the way out belongs to the table, not to
          the bar, and it says "Leave" rather than only drawing an arrow. */}
      {table !== undefined ? (
        <span className="nav__table">
          <span className="nav__code" title="This table's code">
            {table.code}
          </span>
          <LeaveButton table={table} />
        </span>
      ) : null}

      <Who account={account} />
      <Sound />
      {connected === undefined ? null : <Connection up={connected} />}
    </header>
  );
}

/**
 * The way out.
 *
 * Mid-game there is a turn to forfeit, so the first press arms it and the
 * second one leaves — and it disarms itself after a moment, so a stray click
 * on the way past is not a trap left lying about. In a lobby there is nothing
 * to lose and one press is enough.
 */
function LeaveButton({ table }: { table: NavTable }) {
  const [arming, setArming] = useState(false);
  const risky = table.confirm === true;

  useEffect(() => {
    if (!arming) {
      return;
    }
    const timer = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(timer);
  }, [arming]);

  const label = arming ? "Leave — sure?" : "Leave table";
  return (
    <button
      type="button"
      className={`nav__leave${arming ? " nav__leave--warn" : ""}`}
      title={label}
      aria-label={label}
      onClick={() => {
        if (!risky || arming) {
          table.onLeave();
          return;
        }
        setArming(true);
      }}
    >
      <LeaveIcon />
      <span>{arming ? "Sure?" : "Leave"}</span>
    </button>
  );
}

/**
 * Who you are, as one object.
 *
 * Your face, name and balance read as a single thing because they are — and
 * the pill is a link to your own page, since that is the only place it would
 * sensibly lead. Signing out sits outside it, small: present, never prominent.
 */
function Who({ account }: { account: Account }) {
  if (account.loading) {
    return null;
  }
  if (account.profile === null) {
    return account.available ? (
      <a className="btn btn--ghost btn--small" href="/auth/discord">
        Sign in
      </a>
    ) : (
      <span className="nav__guest">playing as a guest</span>
    );
  }

  const low = account.profile.chips < 2000;
  return (
    <>
      <Link to="/me" className="me" title="Your profile">
        <Avatar
          name={account.profile.name}
          avatar={account.profile.avatar}
          accentColor={account.profile.accentColor}
          className="me__face"
        />
        <span className="me__name">{account.profile.name}</span>
        <span className="me__chips">{account.profile.chips.toLocaleString("en-US")}</span>
      </Link>
      {low ? (
        <button type="button" className="btn btn--ghost btn--small" onClick={account.claimDaily}>
          Top up
        </button>
      ) : null}
      <button type="button" className="nav__out" onClick={account.signOut}>
        sign out
      </button>
    </>
  );
}

/**
 * Whether the table can still hear you.
 *
 * Nothing is said while it is fine. A green light that is always on is the
 * same as no light at all, and it spends attention every second to tell you
 * something you already assumed — so the ordinary state is a quiet dot, and
 * only trouble is lit, moving and worded.
 */
function Connection({ up }: { up: boolean }) {
  return (
    <span
      className={`nav__link${up ? "" : " nav__link--down"}`}
      title={up ? "Connected" : "Offline"}
    >
      <i className="nav__dot" />
      {up ? null : <span>offline</span>}
    </span>
  );
}

function LeaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
