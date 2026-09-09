import { POCKETS, WHEEL, colourOf } from "@backroom/game-roulette";
import { type CSSProperties, useState } from "react";

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

/**
 * How far the rim turns while the ball is in the air.
 *
 * A whole number of *turns*, which is not the same as finishing in the same
 * place — and the difference is the whole of this. Whole turns keep the rim's
 * travel a multiple of a full revolution, so a pocket is always its own angle
 * away from wherever the rim finished. Where it finishes is then free, and it
 * has to be: a wheel that parks at the same orientation every spin is a
 * machine resetting itself, and it is obvious after two goes.
 */
const RIM_TURNS = 4;

/**
 * How many times the ball goes round before it drops. Opposite way to the rim.
 *
 * Generous, because turns are what speed looks like: the same easing over more
 * revolutions is a faster ball, and a ball that is still visibly travelling
 * late in the spin is the difference between coasting and grinding to a halt.
 */
const BALL_TURNS = 11;

export function Wheel({
  /** Where the ball is sitting, or null while it is still in the air. */
  pocket,
  /** Whether the wheel is turning, which is a different thing from a result. */
  spinning = false,
  /** Marks the pockets a bet covers, so a player can see what they are on. */
  covered,
  /**
   * How long the ball is in the air.
   *
   * Handed in rather than chosen here, because the table is waiting exactly
   * this long before it settles the cloth. If the two disagree the felt either
   * announces a number the ball has not reached or sits on a finished spin.
   */
  spinMs = 7_000,
}: {
  pocket: number | null;
  spinning?: boolean;
  covered?: ReadonlySet<number>;
  spinMs?: number;
}) {
  const home = pocket === null ? 0 : angleOf(pocket);
  const ball = pocket === null ? null : point(home, 41);

  /*
   * Where the rim is left standing, which is different every spin.
   *
   * A real wheel is not re-set between games: it stops where it stops and the
   * next spin starts from there. This keeps that, and picks a new resting
   * place at the moment a spin begins rather than in an effect afterwards —
   * an effect would render one frame with the old one and the wheel would
   * jump as it started.
   */
  const [rest, setRest] = useState(() => Math.random() * 360);
  const [spun, setSpun] = useState(spinning);
  if (spinning !== spun) {
    setSpun(spinning);
    if (spinning) {
      setRest(Math.random() * 360);
    }
  }

  /*
   * Where each thing ends, handed to CSS as angles it can animate towards.
   *
   * The rim goes one way and the ball the other, which is not decoration: it
   * is the one thing that makes a spinning disc read as a roulette wheel
   * rather than as a loading spinner.
   */
  const turning = spinning && pocket !== null;
  /*
   * The pocket is `home` degrees round *from the rim*, so once the rim can
   * stop anywhere the ball has to be sent that much further. These two are
   * written next to each other deliberately: if they ever drift apart the ball
   * lands visibly in the wrong number while the table pays out on the right
   * one, which is the worst way for this to be wrong.
   */
  const style = {
    "--rim-rest": `${rest}deg`,
    "--rim-from": `${rest + RIM_TURNS * 360}deg`,
    "--ball-to": `${home + rest}deg`,
    "--ball-from": `${home + rest - BALL_TURNS * 360}deg`,
    "--spin-ms": `${spinMs}ms`,
  } as CSSProperties;

  return (
    <div
      className={`rl__wheel${turning ? " rl__wheel--spinning" : ""}`}
      style={style}
      role="img"
      aria-label={
        pocket === null
          ? spinning
            ? "The wheel is turning."
            : "The wheel, at rest."
          : turning
            ? "The wheel is turning."
            : `The ball is in ${pocket}.`
      }
    >
      {/*
        The title names the number only once the ball is in it.

        The result exists from the moment betting closes — the server picks it
        then, and this component needs it to roll the ball to the right place.
        So every drawing of it is a chance to give the game away, and this one
        would give it away to exactly the people who cannot see the wheel spoil
        it any other way.

        It sits as the first child of the svg because the lint rule that
        insists every drawing has one cannot see past a comment.
      */}
      <svg viewBox="0 0 100 100" className="rl__wheel-face">
        <title>{turning || pocket === null ? "Roulette wheel" : `The ball is in ${pocket}`}</title>

        {/* The bowl the rim sits in. */}
        <circle cx="50" cy="50" r="49" className="rl__wheel-bowl" />

        <g className="rl__wheel-rim">
          {/*
            Two kinds of marking, and only one of them may appear mid-spin.
            Which pockets a player's own chips cover is theirs to know and is
            half of what makes watching the ball worth anything. Which pocket
            the ball is going to end up in is not, until it is there.
          */}
          {WHEEL.map((n, at) => {
            const colour = colourOf(n);
            const lit = covered?.has(n) === true;
            return (
              <path
                key={n}
                d={wedge(at, 32, 47)}
                className={`rl__pocket rl__pocket--${colour ?? "zero"}${
                  lit ? " rl__pocket--covered" : ""
                }${!turning && pocket === n ? " rl__pocket--home" : ""}`}
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

        {/*
          The ball, on an arm that swings round the middle.

          An arm rather than a moving point, because two things happen to a
          ball at once and they have different clocks: it goes round, fast then
          slowing, and it falls from the outer track into a pocket, late and
          all at once. Rotating a group and sliding the ball along it keeps
          those two motions separate and lets each have its own easing.
        */}
        {ball === null && !turning ? null : (
          <g className="rl__ball-arm">
            <circle cx="50" cy="50" r="3.1" className="rl__ball" />
          </g>
        )}

        {/*
          The number, in the middle, once the ball is in.

          Where a player is already looking: the ball is the thing they were
          watching and it has just stopped in the middle distance, so the
          answer arrives under their eyes rather than somewhere they have to go
          and find. In its own colour, because "red" is half of what most bets
          on this table were about.
        */}
        {pocket === null || turning ? null : (
          <g className={`rl__called rl__called--${colourOf(pocket) ?? "zero"}`}>
            <circle cx="50" cy="50" r="13" className="rl__called-ground" />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="central">
              {pocket}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
