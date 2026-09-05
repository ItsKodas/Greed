import type { Die as DieFace } from "@greed/rules";

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

interface DieProps {
  face: DieFace;
  held: boolean;
  dead: boolean;
  /** False for spectators and when it is not your turn. */
  interactive: boolean;
  onClick: () => void;
}

export function Die({ face, held, dead, interactive, onClick }: DieProps) {
  const classes = ["die", held ? "die--held" : "", dead ? "die--dead" : ""]
    .filter((name) => name.length > 0)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={dead || !interactive}
      aria-pressed={held}
      aria-label={`Die showing ${face}${held ? ", set aside" : ""}${dead ? ", cannot score" : ""}`}
    >
      {PIPS[face].map(([row, column]) => (
        <span className="die__pip" key={`${row}-${column}`} style={{ gridRow: row, gridColumn: column }} />
      ))}
    </button>
  );
}
