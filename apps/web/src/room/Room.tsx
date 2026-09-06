import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountBadge } from "../account/AccountBadge.js";
import { Sign } from "../game/Sign.js";
import { useAccount } from "../game/useAccount.js";

interface GameOnOffer {
  id: string;
  name: string;
  blurb: string;
  shape: "table" | "machine";
  open: boolean;
  tables: number;
  seated: number;
  watching: number;
}

/**
 * The room itself: what is on offer and how busy it is.
 *
 * Games are not identical cards in a grid. A table game is wide and shows who
 * is sitting at it; a machine stands upright against the wall. The shape says
 * what kind of thing it is before the name is read, and it matches how the two
 * differ underneath — a machine has no seats, no turns and no opponents.
 */
export function Room() {
  const account = useAccount();
  const [games, setGames] = useState<GameOnOffer[]>([]);

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetch("/api/room")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { games: GameOnOffer[] } | null) => {
          if (live && body !== null) {
            setGames(body.games);
          }
        })
        .catch(() => {
          // A room that will not answer keeps whatever it last said, rather
          // than replacing the games with an error nobody can act on.
        });
    };
    load();
    // Busy-ness goes stale quickly and nobody should have to refresh to see it.
    const timer = window.setInterval(load, 10_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  const tables = games.filter((game) => game.shape === "table");
  const machines = games.filter((game) => game.shape === "machine");

  return (
    <main className="room">
      <header className="room__head">
        <h1 className="room__mark">
          <Sign />
        </h1>
        <span className="room__spacer" />
        <AccountBadge account={account} />
      </header>

      <p className="room__label">At the tables</p>
      <div className="room__tables">
        {tables.map((game) => (
          <TableTile key={game.id} game={game} />
        ))}
      </div>

      {machines.length > 0 ? (
        <>
          <p className="room__label">Against the wall</p>
          <div className="room__machines">
            {machines.map((game) => (
              <Cabinet key={game.id} game={game} />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

function busyness(game: GameOnOffer): string {
  if (game.tables === 0) {
    return "Nobody playing — start one";
  }
  const tables = game.tables === 1 ? "1 table" : `${game.tables} tables`;
  const people = game.seated === 1 ? "1 player" : `${game.seated} players`;
  return `${tables}, ${people}`;
}

function TableTile({ game }: { game: GameOnOffer }) {
  const body = (
    <>
      <span className="tile__mark">{game.name}</span>
      <span className="tile__blurb">{game.blurb}</span>
      <span className="tile__foot">
        {/* The only lit thing on this page besides the sign, and it means
            people are in there right now. */}
        {game.tables > 0 ? <i className="tile__live" /> : null}
        {game.open ? busyness(game) : "Not open yet"}
      </span>
    </>
  );

  return game.open ? (
    <Link className="tile" to={`/${game.id}`}>
      {body}
    </Link>
  ) : (
    <div className="tile tile--shut">{body}</div>
  );
}

function Cabinet({ game }: { game: GameOnOffer }) {
  return (
    <div className={`cabinet${game.open ? "" : " cabinet--shut"}`}>
      <div className="cabinet__screen">{game.open ? "777" : "?"}</div>
      <span className="cabinet__name">{game.name}</span>
      <span className="cabinet__note">{game.open ? game.blurb : "Not open yet"}</span>
    </div>
  );
}
