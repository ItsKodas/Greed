import { POCKETS, WHEEL, colourOf } from "@backroom/game-roulette";

/**
 * The wheel.
 *
 * Drawn from the same rim order the rules use rather than from a picture, so
 * the thing on screen and the thing that decides are one list. A wheel drawn in
 * counting order would look plausible and lie: colours would stop alternating,
 * and a ball landing "just past" a number would land nowhere near it.
 *
 * SVG rather than an image because it has to be legible at 120px on a phone
 * and 420px on a desk, and because the ball has to sit in a real pocket rather
 * than at a guessed angle.
 */

/** How far round the rim one pocket is, in degrees. */
const STEP = 360 / POCKETS;

/** Where a pocket sits, measured from twelve o'clock. */
export function angleOf(pocket: number): number {
  const at = WHEEL.indexOf(pocket as (typeof WHEEL)[number]);
  return at < 0 ? 0 : at * STEP;
}

const point = (angle: number, radius: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: 50 + Math.cos(radians) * radius, y: 50 + Math.sin(radians) * radius };
};

/** One pocket, as a wedge of the rim. */
function wedge(at: number, inner: number, outer: number): string {
  const from = at * STEP - STEP / 2;
  const to = at * STEP + STEP / 2;
  const a = point(from, outer);
  const b = point(to, outer);
  const c = point(to, inner);
  const d = point(from, inner);
  return [
    `M ${a.x} ${a.y}`,
    `A ${outer} ${outer} 0 0 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${inner} ${inner} 0 0 0 ${d.x} ${d.y}`,
    "Z",
  ].join(" ");
}

export function Wheel({
  /** Where the ball is sitting, or null while it is still in the air. */
  pocket,
  /** Whether the wheel is turning, which is a different thing from a result. */
  spinning = false,
  /** Marks the pockets a bet covers, so a player can see what they are on. */
  covered,
}: {
  pocket: number | null;
  spinning?: boolean;
  covered?: ReadonlySet<number>;
}) {
  const ball = pocket === null ? null : point(angleOf(pocket), 41);

  return (
    <div
      className={`rl__wheel${spinning ? " rl__wheel--spinning" : ""}`}
      role="img"
      aria-label={
        pocket === null
          ? spinning
            ? "The wheel is turning."
            : "The wheel, at rest."
          : `The ball is in ${pocket}.`
      }
    >
      <svg viewBox="0 0 100 100" className="rl__wheel-face">
        <title>{pocket === null ? "Roulette wheel" : `The ball is in ${pocket}`}</title>

        {/* The bowl the rim sits in. */}
        <circle cx="50" cy="50" r="49" className="rl__wheel-bowl" />

        <g className="rl__wheel-rim">
          {WHEEL.map((n, at) => {
            const colour = colourOf(n);
            const lit = covered?.has(n) === true;
            return (
              <path
                key={n}
                d={wedge(at, 32, 47)}
                className={`rl__pocket rl__pocket--${colour ?? "zero"}${
                  lit ? " rl__pocket--covered" : ""
                }${pocket === n ? " rl__pocket--home" : ""}`}
              />
            );
          })}

          {/*
            Numbers set radially, along their own pocket, the way a real wheel
            prints them. Upright was tried first and does not survive
            thirty-seven of them: a pocket is under ten degrees wide, so upright
            digits collide with their neighbours long before they are big enough
            to read. Turned to match the pocket, each one has the whole wedge.
          */}
          {WHEEL.map((n, at) => {
            const where = point(at * STEP, 39.5);
            const turn = at * STEP;
            /*
             * Flipped through the bottom half. Rotating every number to its own
             * pocket puts the ones past nine o'clock upside down, which is true
             * of a real wheel and useless on a screen you cannot walk around.
             */
            const upright = turn > 90 && turn < 270 ? turn + 180 : turn;
            return (
              <text
                key={n}
                x={where.x}
                y={where.y}
                className="rl__pocket-number"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${upright} ${where.x} ${where.y})`}
              >
                {n}
              </text>
            );
          })}
        </g>

        {/* The cone, and the turret on top of it — the only part of a real
            wheel that catches the light, and the thing that stops the middle
            reading as a flat brown disc. */}
        <circle cx="50" cy="50" r="31" className="rl__wheel-hub" />
        <g className="rl__wheel-spokes">
          {[0, 45, 90, 135].map((turn) => (
            <line
              key={turn}
              x1={point(turn, 30).x}
              y1={point(turn, 30).y}
              x2={point(turn + 180, 30).x}
              y2={point(turn + 180, 30).y}
            />
          ))}
        </g>
        <circle cx="50" cy="50" r="14" className="rl__wheel-cone" />
        <circle cx="50" cy="50" r="6" className="rl__wheel-turret" />

        {ball === null ? null : <circle cx={ball.x} cy={ball.y} r="3.1" className="rl__ball" />}
      </svg>
    </div>
  );
}
