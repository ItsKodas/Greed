import { colourOf } from "@backroom/game-roulette";

/**
 * The board of recent numbers.
 *
 * Every roulette table has one, and it is not decoration: it is the only
 * record of what the wheel has done. Whether it means anything is beside the
 * point — players read it, and a table that hides its own results feels like
 * one with something to hide.
 *
 * Newest last, the way it is printed on a real board.
 */
export function History({ pockets }: { pockets: readonly number[] }) {
  if (pockets.length === 0) {
    return null;
  }
  return (
    <ol className="rl__history" aria-label="Recent numbers, oldest first">
      {pockets.map((pocket, at) => (
        <li
          /* The position is the identity: the same number comes up again, and
             what tells two 17s apart is which spin each was. */
          key={`${at}:${pocket}`}
          className={`rl__past rl__past--${colourOf(pocket) ?? "zero"}${
            at === pockets.length - 1 ? " rl__past--latest" : ""
          }`}
        >
          {pocket}
        </li>
      ))}
    </ol>
  );
}
