/**
 * A figure that rolls to its new value.
 *
 * Each digit is a window onto a strip of nought to nine, moved to the one it
 * is showing. Changing the number moves the strips, so only the digits that
 * actually changed turn — which is what makes it read as a counter on a
 * machine rather than as text being replaced.
 *
 * Everything that is not a digit — the group separators — is drawn straight
 * through. A comma has nothing to roll to.
 */

/** The digits a column can show, in the order they sit on the strip. */
const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Digits({ value }: { value: string }) {
  const characters = [...value];

  return (
    <span className="roll">
      {/*
        * The figure as text, for anybody not looking at it. The rolling
        * columns below are decoration of this rather than the thing itself,
        * so they are hidden and this is what gets read out.
        */}
      <span className="roll__said">{value}</span>
      {characters.map((character, place) => {
        const digit = FACES.indexOf(character);

        if (digit === -1) {
          return (
            <span
              className="roll__gap"
              // Position is the identity: a figure is a fixed run of places
              // that never reorder, and the characters repeat.
              // biome-ignore lint/suspicious/noArrayIndexKey: a figure is positional
              key={place}
              aria-hidden="true"
            >
              {character}
            </span>
          );
        }
        return (
          <span
            className="roll__place"
            // biome-ignore lint/suspicious/noArrayIndexKey: a figure is positional
            key={place}
            aria-hidden="true"
          >
            <span
              className="roll__strip"
              style={{
                transform: `translateY(${-digit * 10}%)`,
                /*
                 * A hair later the further right it sits, so the change sweeps
                 * across rather than every column snapping at once.
                 */
                transitionDelay: `${place * 18}ms`,
              }}
            >
              {FACES.map((face) => (
                <span className="roll__digit" key={face}>
                  {face}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
