import { type Win, colourOf } from "@backroom/game-roulette";

/**
 * The board of who has been paid.
 *
 * The number board next to it says what the wheel has been doing; this says
 * what that has been worth to the people sitting at it, which is the half of
 * the evening the numbers cannot show. A run of reds on the board is a fact
 * about the wheel. A run of reds with nobody's name against it is a table
 * where everybody has been on black, and that is the thing worth knowing.
 *
 * Winners only, and the profit rather than what came back. Every bet on the
 * cloth returns its stake with the payout, so "was handed chips" is true of
 * half the table most spins; finishing up is the part somebody would mention.
 *
 * Newest last, the same way the numbers are, because the two boards are read
 * together and a pair that ran in opposite directions would be a pair nobody
 * could line up.
 */
const fmt = (n: number) => n.toLocaleString("en-US");

export function Winners({ winners }: { winners: readonly Win[] }) {
  if (winners.length === 0) {
    return null;
  }
  return (
    <ol className="rl__winners" aria-label="Recent winners, oldest first">
      {winners.map((win, at) => (
        <li
          /*
           * The spin and the seat together, because neither is enough on its
           * own: one wheel pays several people, and one person is paid by
           * several wheels.
           */
          key={`${win.spin}:${win.seatId}`}
          className={`rl__won${at === winners.length - 1 ? " rl__won--latest" : ""}`}
        >
          {/* The number they were paid on, in its own colour — the same mark
              the board beside this one uses, so the two read as one thing. */}
          <span className={`rl__won-pocket rl__won-pocket--${colourOf(win.pocket) ?? "zero"}`}>
            {win.pocket}
          </span>
          <span className="rl__won-name">{win.name}</span>
          <span className="rl__won-up">+{fmt(win.up)}</span>
        </li>
      ))}
    </ol>
  );
}
