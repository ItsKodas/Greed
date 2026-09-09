import { useCountdown } from "./useCountdown.js";

/**
 * How long the seat being waited on has left, as a ring that empties.
 *
 * Shared, because both card tables ask the same question and a player should
 * not have to learn it twice. It replaced a number in a badge at the poker
 * table: a small "1" beside a seat is a thing you have to read and then work
 * out, and at a table of ten what you want is to see whose turn it is without
 * looking for it. A draining ring says both — whose, and how much is left —
 * at a glance and from across the felt.
 *
 * Drawn around a player's face by both games, because the answer to "whose
 * turn" is a person, and a ring around them says that without a label.
 */
export function TurnRing({ endsAt, turnMs }: { endsAt: number | null; turnMs: number }) {
  /*
   * The drain itself is one CSS animation rather than a number React re-renders
   * while it runs. This still ticks, but only to decide whether the last few
   * seconds are going — which is the one moment the ring should stop being
   * calm about it.
   */
  const secondsLeft = useCountdown(endsAt);
  if (secondsLeft === null || endsAt === null) {
    return null;
  }

  const circumference = 2 * Math.PI * 15.5;
  /*
   * Where the ring starts. Full when a turn has just begun, and correctly part
   * drained for somebody who arrived — or refreshed — in the middle of one,
   * which is what the turn's length is for. A ring that always began full
   * would tell them they have a whole turn when they have five seconds.
   */
  const part = Math.max(0, Math.min(1, (secondsLeft * 1000) / Math.max(1, turnMs)));

  return (
    <span
      className={`turn-ring${secondsLeft <= 5 ? " turn-ring--running-out" : ""}`}
      /* The seconds are the accessible version of the same fact. */
      role="timer"
      aria-label={`${secondsLeft} seconds left to act`}
      style={
        {
          "--ring": `${circumference}`,
          "--ring-from": `${circumference * (1 - part)}`,
          "--ring-ms": `${secondsLeft * 1000}ms`,
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 34 34" aria-hidden="true" focusable="false">
        <circle className="turn-ring__track" cx="17" cy="17" r="15.5" />
        <circle className="turn-ring__left" cx="17" cy="17" r="15.5" />
      </svg>
    </span>
  );
}
