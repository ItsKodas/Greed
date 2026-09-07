import { MAX_SEATS, MIN_TABLE_SEATS } from "@backroom/core";

/**
 * How big a table the host wants.
 *
 * Asked when the table is opened and never again: seats are the shape of the
 * evening, and shrinking one out from under people already sitting at it is
 * not a control anybody should have.
 *
 * A short list rather than a number field. The difference between nine and ten
 * is nothing anybody is deciding between, and a field invites somebody to try
 * a hundred and find out what happens.
 */

/** The sizes on offer. Every one of them is a table somebody would want. */
export const SEAT_CHOICES = [2, 4, 6, 8, MAX_SEATS] as const;

export function SeatCount({
  value,
  onChange,
  /** A game may allow fewer than the house does; nothing above it is offered. */
  ceiling = MAX_SEATS,
}: {
  value: number;
  onChange: (seats: number) => void;
  ceiling?: number;
}) {
  const offered = SEAT_CHOICES.filter(
    (seats) => seats <= ceiling && seats >= MIN_TABLE_SEATS,
  );

  return (
    <div className="bots">
      <span className="bots__label">Seats</span>
      <div className="bots__row" role="radiogroup" aria-label="How many seats">
        {offered.map((seats) => (
          <button
            key={seats}
            type="button"
            role="radio"
            aria-checked={value === seats}
            className={`btn btn--small${value === seats ? "" : " btn--ghost"}`}
            onClick={() => onChange(seats)}
          >
            {seats}
          </button>
        ))}
      </div>
      <p className="bots__hint">Set when the table opens, and fixed after that.</p>
    </div>
  );
}
