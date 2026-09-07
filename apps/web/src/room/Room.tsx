import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../game/useAccount.js";
import { Navbar } from "../nav/Navbar.js";

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
      <Navbar account={account} />

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
      {/*
       * The same card a link to this game unfurls into.
       *
       * One drawing rather than two: the banner already carries the name, the
       * blurb and the game's own furniture, and keeping a second version of
       * all that in markup is how the two come to disagree. The alt text is
       * what it says, so a tile still reads if the image never arrives.
       */}
      <img
        className="tile__art"
        src={`/og/${game.id}.png`}
        alt={`${game.name} — ${game.blurb}`}
        width={1200}
        height={630}
      />
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
