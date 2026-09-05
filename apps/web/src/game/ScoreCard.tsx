import type { Die, Ruleset } from "@greed/rules";

const fmt = (n: number) => n.toLocaleString("en-US");

/** How each face is written on the card. */
const LETTERS: Record<Die, string> = { 1: "$", 2: "G", 3: "R", 4: "E", 5: "E", 6: "D" };
const TONE: Partial<Record<Die, string>> = { 3: "red", 5: "green" };

interface SpanningRow {
  label: string;
  points: number;
}

/**
 * The scoring, printed on the felt.
 *
 * Read out of the ruleset rather than written down, so it is right for the
 * classic game, right for the letter dice, and right for anything a host
 * changes later — a scoring table that can disagree with the scoring is worse
 * than no table at all.
 */
export function ScoreCard({ rules }: { rules: Ruleset }) {
  const letters = rules.skin === "letters";

  // Only show a column if some face actually scores at that many dice.
  const sizes = [1, 2, 3, 4, 5, 6].filter((size) =>
    rules.faces.some((face) => (face[size - 1] ?? 0) > 0),
  );

  const spanning: SpanningRow[] = [];
  if (rules.straight !== null && rules.straight > 0) {
    spanning.push({ label: letters ? "$GREED" : "1-2-3-4-5-6", points: rules.straight });
  }
  if (rules.threePairs !== null && rules.threePairs > 0) {
    spanning.push({ label: "Three pairs", points: rules.threePairs });
  }
  if (rules.twoTriplets !== null && rules.twoTriplets > 0) {
    spanning.push({ label: "Two triplets", points: rules.twoTriplets });
  }
  if (rules.fourPlusPair !== null && rules.fourPlusPair > 0) {
    spanning.push({ label: "Four and a pair", points: rules.fourPlusPair });
  }

  return (
    <div className="card" aria-label="What everything scores">
      <table className="card__grid">
        <thead>
          <tr>
            <th scope="col" className="card__corner">
              <span className="card__how">how many</span>
            </th>
            {sizes.map((size) => (
              <th scope="col" key={size}>
                {size}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.faces.map((face, index) => {
            const die = (index + 1) as Die;
            const tone = TONE[die];
            return (
              <tr key={die}>
                <th scope="row">
                  <span
                    className={`card__face${tone !== undefined ? ` card__face--${tone}` : ""}`}
                  >
                    {letters ? LETTERS[die] : die}
                  </span>
                </th>
                {sizes.map((size) => {
                  const points = face[size - 1] ?? 0;
                  return (
                    <td key={size} className={points === 0 ? "card__none" : undefined}>
                      {points === 0 ? "·" : fmt(points)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {spanning.length > 0 ? (
        <ul className="card__extras">
          {spanning.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <b>{fmt(row.points)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
