import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../game/useAccount.js";
import { Navbar } from "../nav/Navbar.js";
import { TileArt } from "./TileArt.js";
// Both rooms' colours, because the tiles below are dressed in them.
import "@backroom/game-greed/theme.css";
import "@backroom/game-blackjack/theme.css";

interface GameOnOffer {
  id: string;
  name: string;
  blurb: string;
  /** How the game writes its own name, if it writes it any particular way. */
  mark?: { text: string; accentAt: number };
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

/**
 * A game's name, written the way that game writes it.
 *
 * Greed has been GRE-E-D since its first screen and the marked letter is the
 * whole thing; a game with nothing of the sort has its name written plainly.
 * The same treatment the navbar gives it, and the same the link cards do.
 */
function Mark({ game }: { game: GameOnOffer }) {
  const mark = game.mark;
  if (mark === undefined) {
    return <>{game.name}</>;
  }
  return (
    <>
      {mark.text.slice(0, mark.accentAt)}
      <em>{mark.text[mark.accentAt]}</em>
      {mark.text.slice(mark.accentAt + 1)}
    </>
  );
}

function TableTile({ game }: { game: GameOnOffer }) {
  const body = (
    <>
      {/* The room's own furniture, tucked into the corner until the pointer
          comes near and then thrown up and apart. */}
      <span className="tile__art" aria-hidden="true">
        <TileArt game={game.id} />
      </span>
      <span className="tile__mark">
        <Mark game={game} />
      </span>
      <span className="tile__blurb">{game.blurb}</span>
      <span className="tile__foot">
        {/* The only lit thing on this page besides the sign, and it means
            people are in there right now. */}
        {game.tables > 0 ? <i className="tile__live" /> : null}
        {game.open ? busyness(game) : "Not open yet"}
      </span>
    </>
  );

  /*
   * Dressed in the game's own room. The theme files set their colours on
   * anything carrying data-game rather than only on the document, so a tile
   * is a window into that room rather than a picture of one.
   */
  return game.open ? (
    <Link className="tile" data-game={game.id} to={`/${game.id}`}>
      {body}
    </Link>
  ) : (
    <div className="tile tile--shut" data-game={game.id}>
      {body}
    </div>
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
