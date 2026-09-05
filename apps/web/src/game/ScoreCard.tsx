import type { Die, FaceScores, Ruleset } from "@greed/rules";

const fmt = (n: number) => n.toLocaleString("en-US");

/** How each face is written on the printed table. */
const LETTERS: Record<Die, string> = { 1: "$", 2: "G", 3: "R", 4: "E", 5: "E", 6: "D" };

/**
 * The names the real table gives its faces. They are also the colours: silver,
 * gold, ruby, ebony, emerald, diamond.
 */
const GEMS: Record<Die, string> = {
  1: "SILVER",
  2: "GOLD",
  3: "RUBY",
  4: "EBONY",
  5: "EMERALD",
  6: "DIAMOND",
};

const TONE: Partial<Record<Die, string>> = { 3: "red", 5: "green" };

const COUNT_WORDS: Record<number, string> = {
  2: "TWO",
  3: "THREE",
  4: "FOUR",
  5: "FIVE",
  6: "SIX",
};

interface Row {
  key: string;
  /** Rendered before the leader dots. */
  label: React.ReactNode;
  points: number;
  /** Given its own line, the way the table sets off its headline scores. */
  banner?: boolean;
}

function faceMark(die: Die, letters: boolean) {
  const tone = TONE[die];
  return (
    <span className={`card__face${tone !== undefined ? ` card__face--${tone}` : ""}`}>
      {letters ? LETTERS[die] : die}
    </span>
  );
}

/** True when every face pays the same for this many, e.g. six of a kind. */
function uniform(faces: readonly FaceScores[], size: number): number | null {
  const first = faces[0]?.[size - 1] ?? 0;
  if (first === 0) {
    return null;
  }
  return faces.every((face) => (face[size - 1] ?? 0) === first) ? first : null;
}

/**
 * True when this many of a face always pays a fixed multiple of its triple.
 * The classic game does this — four, five and six of a kind are the triple
 * doubled, quadrupled and octupled — and writing that once beats eighteen rows.
 */
function multipleOfTriple(faces: readonly FaceScores[], size: number): number | null {
  let ratio: number | null = null;
  for (const face of faces) {
    const triple = face[2] ?? 0;
    const value = face[size - 1] ?? 0;
    if (triple === 0 || value === 0) {
      return null;
    }
    const candidate = value / triple;
    if (!Number.isInteger(candidate)) {
      return null;
    }
    if (ratio === null) {
      ratio = candidate;
    } else if (ratio !== candidate) {
      return null;
    }
  }
  return ratio;
}

/**
 * The scoring, laid out the way the printed table lays it out.
 *
 * Read out of the ruleset rather than written down, so it is right for the
 * classic game, right for the letter dice, and right for anything a host
 * changes later. A scoring table that can disagree with the scoring is worse
 * than no table at all.
 */
export function ScoreCard({ rules }: { rules: Ruleset }) {
  const letters = rules.skin === "letters";
  const rows: Row[] = [];

  if (rules.straight !== null && rules.straight > 0) {
    rows.push({
      key: "straight",
      label: <span className="card__shout">{letters ? "$GREED" : "1-2-3-4-5-6"}</span>,
      points: rules.straight,
      banner: true,
    });
  }

  for (const size of [2, 3, 4, 5, 6]) {
    const shared = uniform(rules.faces, size);
    if (shared !== null) {
      rows.push({
        key: `all-${size}`,
        label: <span className="card__shout">{COUNT_WORDS[size]} OF A KIND</span>,
        points: shared,
        banner: true,
      });
      continue;
    }

    const ratio = size > 3 ? multipleOfTriple(rules.faces, size) : null;
    if (ratio !== null) {
      rows.push({
        key: `ratio-${size}`,
        label: (
          <>
            {size}x ANY <span className="card__gem">({ratio}x THE TRIPLE)</span>
          </>
        ),
        points: 0,
      });
      continue;
    }

    // Best first, the way the printed table orders its columns.
    rules.faces
      .map((face, index) => ({ die: (index + 1) as Die, points: face[size - 1] ?? 0 }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points || a.die - b.die)
      .forEach(({ die, points }) => {
        rows.push({
          key: `${size}-${die}`,
          label: (
            <>
              {size}x{faceMark(die, letters)}
              {letters ? <span className="card__gem">({GEMS[die]})</span> : null}
            </>
          ),
          points,
        });
      });
  }

  if (rules.threePairs !== null && rules.threePairs > 0) {
    rows.push({ key: "pairs", label: <>THREE PAIRS</>, points: rules.threePairs });
  }
  if (rules.twoTriplets !== null && rules.twoTriplets > 0) {
    rows.push({ key: "triplets", label: <>TWO TRIPLETS</>, points: rules.twoTriplets });
  }
  if (rules.fourPlusPair !== null && rules.fourPlusPair > 0) {
    rows.push({ key: "fourpair", label: <>FOUR AND A PAIR</>, points: rules.fourPlusPair });
  }

  // Singles last, the way the table tucks them under the rule, best first.
  rules.faces
    .map((face, index) => ({ die: (index + 1) as Die, points: face[0] ?? 0 }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.die - b.die)
    .forEach(({ die, points }) => {
      rows.push({
        key: `single-${die}`,
        label: <>1x{faceMark(die, letters)}</>,
        points,
      });
    });

  return (
    <dl className="card" aria-label="What everything scores">
      {rows.map((row) => (
        <div className={`card__row${row.banner === true ? " card__row--banner" : ""}`} key={row.key}>
          <dt>{row.label}</dt>
          <span className="card__leader" aria-hidden="true" />
          <dd>{row.points > 0 ? `${fmt(row.points)}pts.` : ""}</dd>
        </div>
      ))}
    </dl>
  );
}
