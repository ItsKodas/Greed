import type { DiceSkin, Die as DieFace } from "@greed/rules";

/** Pip positions per face, as [row, column] on a 3x3 grid. */
const PIPS: Record<DieFace, ReadonlyArray<readonly [number, number]>> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [1, 3],
    [2, 1],
    [2, 3],
    [3, 1],
    [3, 3],
  ],
};

/**
 * The letter edition, face for face. Faces 4 and 5 are both E — that is the
 * point of them, and the colour is what tells them apart. `$GREED` needs one of
 * each, so the two must never be drawn the same.
 */
const LETTERS: Record<DieFace, string> = {
  1: "$",
  2: "G",
  3: "R",
  4: "E",
  5: "E",
  6: "D",
};

/** Spoken form, so the die still reads correctly to a screen reader. */
const LETTER_NAMES: Record<DieFace, string> = {
  1: "dollar",
  2: "G",
  3: "R",
  4: "black E",
  5: "green E",
  6: "D",
};

interface DieProps {
  face: DieFace;
  skin: DiceSkin;
  held: boolean;
  dead: boolean;
  /** False for spectators and when it is not your turn. */
  interactive: boolean;
  onClick: () => void;
}

export function Die({ face, skin, held, dead, interactive, onClick }: DieProps) {
  const letters = skin === "letters";
  const classes = ["die", held ? "die--held" : "", dead ? "die--dead" : ""]
    .filter((name) => name.length > 0)
    .join(" ");

  const shown = letters ? LETTER_NAMES[face] : String(face);

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={dead || !interactive}
      aria-pressed={held}
      aria-label={`Die showing ${shown}${held ? ", set aside" : ""}${dead ? ", cannot score" : ""}`}
    >
      {letters ? (
        <span className={`die__letter${face === 5 ? " die__letter--green" : ""}`}>
          {LETTERS[face]}
        </span>
      ) : (
        PIPS[face].map(([row, column]) => (
          <span
            className="die__pip"
            key={`${row}-${column}`}
            style={{ gridRow: row, gridColumn: column }}
          />
        ))
      )}
    </button>
  );
}
