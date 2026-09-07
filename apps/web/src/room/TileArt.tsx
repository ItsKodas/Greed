/**
 * What a game keeps in the corner of its tile.
 *
 * Dice for Greed, cards for Blackjack — the same furniture the link cards
 * carry, drawn again here rather than shared with them, because these are a
 * few hundred pixels across and animate, and those are print. One drawing
 * asked to be both would be tuned for neither.
 *
 * Every piece is its own group so the tile can move them independently: they
 * sit low and tucked into the corner at rest, and come up and apart when the
 * pointer is on the tile. The transforms live in game.css beside the tile.
 */

/** One piece of furniture, numbered so the stylesheet can move it. */
function Piece({ n, children }: { n: number; children: React.ReactNode }) {
  return <g className={`art__piece art__piece--${n}`}>{children}</g>;
}

function Die({ x, y, turn, spots }: { x: number; y: number; turn: number; spots: [number, number][] }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <rect x="-30" y="-30" width="60" height="60" rx="11" fill="#e8ecf3" />
      <rect x="-30" y="-30" width="60" height="60" rx="11" fill="none" stroke="#aab4c4" strokeWidth="1.5" />
      {spots.map(([sx, sy]) => (
        <circle key={`${sx},${sy}`} cx={sx} cy={sy} r="5.2" fill="#1b2028" />
      ))}
    </g>
  );
}

export function DiceArt() {
  return (
    <svg viewBox="0 0 200 160" role="img" aria-hidden="true" focusable="false">
      <Piece n={1}>
        <Die x={70} y={96} turn={-14} spots={[[0, 0]]} />
      </Piece>
      <Piece n={2}>
        <Die
          x={132}
          y={78}
          turn={10}
          spots={[
            [-14, -14],
            [14, -14],
            [-14, 14],
            [14, 14],
            [0, 0],
          ]}
        />
      </Piece>
      <Piece n={3}>
        <Die
          x={106}
          y={140}
          turn={22}
          spots={[
            [-14, -14],
            [0, 0],
            [14, 14],
          ]}
        />
      </Piece>
    </svg>
  );
}

function PlayingCard({
  x,
  y,
  turn,
  rank,
  red,
}: {
  x: number;
  y: number;
  turn: number;
  rank: string;
  red: boolean;
}) {
  const ink = red ? "#a8321f" : "#1b2028";
  // Drawn rather than typed, for the same reason the deck is: a suit is only
  // as good as the font that happens to have loaded.
  const pip = red
    ? "M0 8 C -8 3, -14 -2, -14 -8 C -14 -12, -10 -14, -7 -14 C -3 -14, -1 -12, 0 -10 C 1 -12, 3 -14, 7 -14 C 10 -14, 14 -12, 14 -8 C 14 -2, 8 3, 0 8 Z"
    : "M0 -13 C 8 -5, 14 -2, 14 2 C 14 6, 10 8, 6 8 C 3 8, 1 7, 0 5 C -1 7, -3 8, -6 8 C -10 8, -14 6, -14 2 C -14 -2, -8 -5, 0 -13 Z M-1 5 C -2 8, -4 10, -6 11 L 6 11 C 4 10, 2 8, 1 5 Z";

  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <rect x="-38" y="-54" width="76" height="108" rx="8" fill="#f4f2ec" />
      <rect x="-38" y="-54" width="76" height="108" rx="8" fill="none" stroke="#aab4c4" strokeWidth="1.5" />
      <text
        x="-26"
        y="-26"
        fontFamily="Georgia, serif"
        fontWeight="700"
        fontSize="26"
        textAnchor="middle"
        fill={ink}
      >
        {rank}
      </text>
      <path d={pip} transform="translate(-26 -4) scale(0.5)" fill={ink} />
      <path d={pip} transform="translate(12 26) scale(0.72)" fill={ink} />
    </g>
  );
}

export function CardsArt() {
  return (
    <svg viewBox="0 0 200 160" role="img" aria-hidden="true" focusable="false">
      <Piece n={1}>
        <PlayingCard x={74} y={96} turn={-13} rank="A" red={false} />
      </Piece>
      <Piece n={2}>
        <PlayingCard x={130} y={86} turn={9} rank="K" red />
      </Piece>
    </svg>
  );
}

/** A game with nothing of its own yet still gets a corner: a stack of chips. */
export function ChipsArt() {
  return (
    <svg viewBox="0 0 200 160" role="img" aria-hidden="true" focusable="false">
      {[0, 1, 2].map((index) => (
        <Piece key={index} n={index + 1}>
          <g transform={`translate(${104 + index * 6} ${118 - index * 20})`}>
            <ellipse cx="0" cy="0" rx="34" ry="12" fill="#171b22" />
            <ellipse cx="0" cy="-3" rx="34" ry="12" fill="#e0b048" />
            <ellipse cx="0" cy="-3" rx="16" ry="5.5" fill="#171b22" opacity="0.55" />
          </g>
        </Piece>
      ))}
    </svg>
  );
}

/** A chip, seen face on. */
function ChipFace({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <circle cx="0" cy="0" r="15" fill="#e0b048" />
      <circle cx="0" cy="0" r="15" fill="none" stroke="#171b22" strokeWidth="2.5" strokeDasharray="5 4" />
      <circle cx="0" cy="0" r="7" fill="#171b22" opacity="0.45" />
    </g>
  );
}

/** The seven, drawn rather than typed: a glyph is only as good as its font. */
function SevenFace({ y }: { y: number }) {
  return (
    <path
      transform={`translate(0 ${y})`}
      d="M-9 -14 L9 -14 L9 -9 L1 14 L-5 14 L3 -9 L-9 -9 Z"
      fill="#ff86d4"
    />
  );
}

function BellFace({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <path
        d="M0 -15 C 7 -15, 11 -9, 11 -2 C 11 5, 13 8, 14 10 L -14 10 C -13 8, -11 5, -11 -2 C -11 -9, -7 -15, 0 -15 Z"
        fill="#e8c168"
      />
      <circle cx="0" cy="13" r="3" fill="#e8c168" />
    </g>
  );
}

/**
 * The machine against the wall.
 *
 * Three reels behind a window, each carrying more faces than the window shows,
 * so the roll on hover has somewhere to come from and somewhere to go. Its
 * motion is in game.css beside the cabinet: a reel rolls, it does not fly out
 * of a corner like the furniture on a table game's tile.
 */
export function ReelsArt() {
  const reels = [20, 76, 132];
  return (
    <svg viewBox="0 0 200 160" role="img" aria-hidden="true" focusable="false">
      <defs>
        {reels.map((x, index) => (
          <clipPath key={x} id={`reel-window-${index}`}>
            <rect x={x} y="18" width="48" height="124" rx="6" />
          </clipPath>
        ))}
      </defs>
      {reels.map((x, index) => (
        <g key={x}>
          <rect x={x} y="18" width="48" height="124" rx="6" fill="#0f0a14" />
          <g clipPath={`url(#reel-window-${index})`}>
            {/*
             * Two groups, not one. The stylesheet rolls the inner one with a
             * CSS transform, and a CSS transform *replaces* an element's
             * transform attribute rather than composing with it — so putting
             * this reel across on the same group would have the roll wipe out
             * the placement and stack all three reels at x=0, outside their
             * own windows.
             */}
            <g transform={`translate(${x + 24} 0)`}>
              {/* Numbered so the stylesheet can roll each one a beat apart. */}
              <g className={`art__piece art__piece--${index + 1}`}>
                <ChipFace y={40} />
                <SevenFace y={80} />
                <BellFace y={120} />
                <ChipFace y={160} />
                <SevenFace y={200} />
              </g>
            </g>
          </g>
          <rect
            x={x}
            y="18"
            width="48"
            height="124"
            rx="6"
            fill="none"
            stroke="#3a2749"
            strokeWidth="2"
          />
        </g>
      ))}
    </svg>
  );
}

/** The furniture a game keeps, by which game it is. */
export function TileArt({ game }: { game: string }) {
  if (game === "greed") {
    return <DiceArt />;
  }
  if (game === "blackjack") {
    return <CardsArt />;
  }
  if (game === "slots") {
    return <ReelsArt />;
  }
  return <ChipsArt />;
}
