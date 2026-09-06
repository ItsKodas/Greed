import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountBadge } from "../account/AccountBadge.js";
import { Avatar } from "../game/Avatar.js";
import { Sign } from "../game/Sign.js";
import { useAccount } from "../game/useAccount.js";

interface PlayedGame {
  code: string;
  rulesetName: string;
  buyIn: number;
  pot: number;
  players: Array<{ userId: string | null; name: string; score: number; isBot: boolean }>;
  winnerIds: string[];
  endedAt: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * What one game calls its own figures.
 *
 * The store keeps them as numbers by name and refuses to know what they mean,
 * which is right — but somebody has to turn `bestTurn` into "best turn", and
 * the honest place is beside the game it belongs to.
 */
const FIGURE_NAMES: Record<string, Record<string, string>> = {
  greed: {
    bestTurn: "best turn",
    farkles: "farkles",
    hotDice: "hot dice",
  },
};

const GAME_NAMES: Record<string, string> = { greed: "Greed", blackjack: "Blackjack" };

export function Profile() {
  const account = useAccount();
  const [history, setHistory] = useState<PlayedGame[]>([]);

  useEffect(() => {
    if (account.profile === null) {
      return;
    }
    let live = true;
    void fetch("/api/games", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { games: PlayedGame[] } | null) => {
        if (live && body !== null) {
          setHistory(body.games);
        }
      })
      .catch(() => {
        // History is the least of what this page is for; without it the rest
        // of the page is still worth showing.
      });
    return () => {
      live = false;
    };
  }, [account.profile]);

  return (
    <main className="room">
      <header className="room__head">
        <h1 className="room__mark">
          <Link to="/" aria-label="Back to The Back Room">
            <Sign />
          </Link>
        </h1>
        <span className="room__spacer" />
        <AccountBadge account={account} />
      </header>

      {account.loading ? null : account.profile === null ? (
        <p className="panel__note">
          Sign in to keep a balance, a history, and figures worth arguing about.
        </p>
      ) : (
        <Signed
          profile={account.profile}
          history={history}
          dailyDue={account.dailyDue}
          onDaily={account.claimDaily}
        />
      )}
      {account.dailyMessage !== null ? (
        <p className="play__event">{account.dailyMessage}</p>
      ) : null}
    </main>
  );
}

function Signed({
  profile,
  history,
  dailyDue,
  onDaily,
}: {
  profile: NonNullable<ReturnType<typeof useAccount>["profile"]>;
  history: PlayedGame[];
  dailyDue: boolean;
  onDaily: () => void;
}) {
  const { games, wins, chipsWon } = profile.stats;
  const rate = games === 0 ? 0 : Math.round((wins / games) * 100);

  return (
    <div className="profile">
      <div className="profile__who">
        <div className="panel">
          <div className="who">
            <Avatar
              name={profile.name}
              avatar={profile.avatar}
              accentColor={profile.accentColor}
              className="who__face"
            />
            <span className="who__name">{profile.name}</span>
          </div>
          <div className="purse">
            <b className="purse__count">{fmt(profile.chips)}</b>
            <small>chips</small>
          </div>
          {/* Only offered when it would grant something. A button whose only
              possible answer is "you have plenty already" is not an offer. */}
          {dailyDue ? (
            <button type="button" className="btn btn--wide" onClick={onDaily}>
              Claim daily top-up
            </button>
          ) : (
            <p className="panel__note purse__note">
              The daily top-up is for running dry. Come back under 2,000.
            </p>
          )}
        </div>
        <Redeem onRedeemed={() => window.location.reload()} />
      </div>

      <div className="profile__figures">
        {/* Shared first: these are the four things every game can answer. */}
        <div className="figures">
          <Figure value={fmt(games)} label="games played" />
          <Figure value={fmt(wins)} label="won" />
          <Figure value={`${chipsWon >= 0 ? "+" : ""}${fmt(chipsWon)}`} label="chips won" money />
          <Figure value={`${rate}%`} label="win rate" />
        </div>

        {Object.entries(profile.byGame).map(([game, figures]) => (
          <section className="panel" key={game}>
            <p className="panel__label">{GAME_NAMES[game] ?? game}</p>
            <div className="figures">
              {Object.entries(figures).map(([key, value]) => (
                <Figure
                  key={key}
                  value={fmt(value)}
                  label={FIGURE_NAMES[game]?.[key] ?? key}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="panel">
          <p className="panel__label">Recent games</p>
          {history.length === 0 ? (
            <p className="panel__note">Nothing finished yet.</p>
          ) : (
            <div className="scroller">
              <table className="history">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Rules</th>
                    <th>Players</th>
                    <th className="history__num">Chips</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((game) => {
                    const won = game.winnerIds.includes(profile.id);
                    const change = won ? game.pot - game.buyIn : -game.buyIn;
                    return (
                      <tr key={`${game.code}-${game.endedAt}`}>
                        <td className="history__code">{game.code}</td>
                        <td>{game.rulesetName}</td>
                        <td>{game.players.length}</td>
                        <td className={`history__num ${change >= 0 ? "up" : "down"}`}>
                          {change >= 0 ? "+" : ""}
                          {fmt(change)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Figure({ value, label, money }: { value: string; label: string; money?: boolean }) {
  return (
    <div className="figure">
      <b className={money === true ? "figure__money" : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** How a refusal is put to the person who typed the code. */
const REFUSALS: Record<string, string> = {
  "unknown-code": "No code like that.",
  "already-redeemed": "You have already used that one.",
  "used-up": "That code has been used up.",
  expired: "That code has expired.",
  revoked: "That code is no longer good.",
  "too-many": "Too many tries. Give it a minute.",
  "sign-in": "Sign in first.",
};

function Redeem({ onRedeemed }: { onRedeemed: () => void }) {
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = () => {
    if (typed.trim().length === 0 || busy) {
      return;
    }
    setBusy(true);
    void fetch("/api/redeem", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: typed }),
    })
      .then((response) => response.json())
      .then((body: { ok: boolean; chips?: number; reason?: string }) => {
        if (body.ok) {
          setSaid(`Redeemed for ${fmt(body.chips ?? 0)} chips.`);
          setTyped("");
          onRedeemed();
        } else {
          setSaid(REFUSALS[body.reason ?? ""] ?? "That did not work.");
        }
      })
      .catch(() => setSaid("Could not reach the room. Try again."))
      .finally(() => setBusy(false));
  };

  return (
    <section className="panel">
      <p className="panel__label">Redeem a code</p>
      <div className="redeem">
        <input
          className="field__input redeem__input"
          value={typed}
          maxLength={20}
          placeholder="XXXX-XXXX-XX"
          aria-label="Redemption code"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
        />
        <button type="button" className="btn" disabled={busy} onClick={send}>
          Redeem
        </button>
      </div>
      {said === null ? (
        <p className="panel__note">Codes come from the Discord. Each works once per player.</p>
      ) : (
        <p className="panel__note">{said}</p>
      )}
    </section>
  );
}
