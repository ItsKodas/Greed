import { Link } from "react-router-dom";
import { Avatar } from "../game/Avatar.js";
import type { Account } from "../game/useAccount.js";

/**
 * Who you are and what you have, in the corner of every page.
 *
 * It belongs to the building rather than to any game: the same person with the
 * same purse is at every table, and seeing a different badge in each room would
 * suggest otherwise.
 */
export function AccountBadge({ account }: { account: Account }) {
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
      {/* Your name is the way to your own page; there is nowhere else it
          would sensibly lead. */}
      <Link className="account__me" to="/me">
        <Avatar
          name={account.profile.name}
          avatar={account.profile.avatar}
          accentColor={account.profile.accentColor}
          className="account__face"
        />
        <span className="account__name">{account.profile.name}</span>
      </Link>
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
