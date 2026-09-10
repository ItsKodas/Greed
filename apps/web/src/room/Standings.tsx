import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../game/Avatar.js";
import { compact, exact } from "../game/money.js";
import type { Board } from "../leaderboard/board.js";

/**
 * Who is ahead, from the front door.
 *
 * The top three and your own place, which is the whole of what somebody wants
 * to know without opening the board. Signed out it says so and still links
 * through: a page you cannot see yet is better than a page you never learn is
 * there.
 */
export function Standings() {
  const [board, setBoard] = useState<Board | null>(null);
  const [shut, setShut] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetch("/api/leaderboard", { credentials: "include" })
        .then(async (response) => {
          if (!live) {
            return;
          }
          if (response.status === 401) {
            setShut(true);
            return;
          }
          if (response.ok) {
            setShut(false);
            setBoard((await response.json()) as Board);
          }
        })
        .catch(() => {
          // The last answer is better than an error nobody can act on.
        });
    };
    load();
    // The same clock the room's busyness is on.
    const timer = window.setInterval(load, 10_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link className="standings" to="/leaderboard">
      {shut || board === null ? (
        <span className="standings__note">Sign in to see who's ahead.</span>
      ) : (
        <>
          <ol className="standings__top">
            {board.rows.slice(0, 3).map((row, index) => (
              <li key={row.id} className="standings__place">
                <b>{index + 1}</b>
                <Avatar
                  name={row.name}
                  avatar={row.avatar}
                  accentColor={row.accentColor}
                  className="standings__face"
                />
                <span className="standings__name">{row.name}</span>
                <span className="standings__chips" title={`${exact(row.chips)} chips`}>
                  {compact(row.chips)}
                </span>
              </li>
            ))}
          </ol>
          {board.you === null ? null : (
            <p className="standings__you">
              You are {board.you.rank} of {exact(board.total)}
            </p>
          )}
        </>
      )}
    </Link>
  );
}
