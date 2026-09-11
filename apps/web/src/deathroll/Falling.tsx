/**
 * The number, and the only motion a duel has to speak of.
 *
 * One element for both states, marked with `data-falling`, because a die
 * tumbling and a die settled are one physical object rather than two — an
 * identity that survives the change is what lets a single CSS motion run from
 * unresolved to resolved instead of one animation replacing another mid-air.
 *
 * Nothing is shown while `rolling` is true, whatever `value` happens to be.
 * A caller might well be holding the very number this settles on — the
 * ceiling it is about to become — so the guard belongs here rather than
 * trusted to every caller: a result is the table's to say, never a guess
 * dressed up as one.
 */
export function Falling({ value, rolling }: { value: number; rolling: boolean }) {
  const settledOnOne = !rolling && value === 1;
  return (
    <p
      data-falling
      // Says the number the moment it changes, for anyone who cannot see it
      // fall — the keyframes are decoration, and this is the fact underneath.
      aria-live="polite"
      className={[
        "dr__number",
        rolling ? "dr__number--rolling" : "dr__number--settled",
        settledOnOne ? "dr__number--hit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {rolling ? null : value}
    </p>
  );
}
