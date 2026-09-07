import type { TableOnOffer } from "@backroom/shared";
import { useEffect, useState } from "react";

/**
 * The tables anybody may walk up to.
 *
 * A code you have to be given is fine between two people who are already
 * talking, and useless for walking into a room to see whether anything is
 * happening. This is the second thing — so it says who opened each table and
 * how full it is, and nothing whatever about the play, because somebody
 * reading this list does not have a seat yet.
 */
export function PublicTables({
  game,
  onJoin,
  onWatch,
  busy,
  canSit,
  whyNotSit,
}: {
  /** Which game's tables to show. */
  game: string;
  onJoin: (code: string) => void;
  onWatch: (code: string) => void;
  busy: boolean;
  /** False for a guest at a table that will not have them. */
  canSit: boolean;
  /**
   * Why not, in a few words. A disabled button that will not say what is
   * wrong with it is a dead end, and the reason differs by game — one wants a
   * name, the other wants an account.
   */
  whyNotSit?: string;
}) {
  const [tables, setTables] = useState<TableOnOffer[] | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetch(`/api/tables?game=${encodeURIComponent(game)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { tables: TableOnOffer[] } | null) => {
          if (live && body !== null) {
            setTables(body.tables);
          }
        })
        .catch(() => {
          // A list that will not answer keeps whatever it last said. The two
          // panels above it are the way in that always works.
        });
    };
    load();
    // Tables fill and empty while you are reading, and nobody should have to
    // refresh to find that out.
    const timer = window.setInterval(load, 8000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [game]);

  // Nothing at all until the first answer, so the page does not flash an
  // emptiness that was never true.
  if (tables === null) {
    return null;
  }

  return (
    <section className="open-tables">
      <p className="panel__label">
        Open tables
        {tables.length > 0 ? <span className="open-tables__count">{tables.length}</span> : null}
      </p>

      {tables.length === 0 ? (
        <p className="panel__note">
          Nobody has a table open. Start one above and it will show up here for everyone else.
        </p>
      ) : (
        <ul className="open-tables__list">
          {tables.map((table) => {
            const full = table.seats >= table.maxSeats;
            const playing = table.status !== "lobby";
            return (
              <li key={table.code} className="open-table">
                <span className="open-table__code">{table.code}</span>
                <span className="open-table__host">{table.host}</span>
                <span className="open-table__seats">
                  {table.seats}/{table.maxSeats}
                  {table.watching > 0 ? ` · ${table.watching} watching` : ""}
                </span>
                {/* Lit means it is happening now, the same as everywhere else. */}
                <span className={`open-table__state${playing ? " open-table__state--live" : ""}`}>
                  {playing ? "in play" : "waiting"}
                </span>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={busy || full || !canSit}
                  title={full ? "That table is full." : !canSit ? whyNotSit : undefined}
                  onClick={() => onJoin(table.code)}
                >
                  {full ? "Full" : "Sit"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy}
                  onClick={() => onWatch(table.code)}
                >
                  Watch
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
