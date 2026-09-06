/**
 * The sign over the door.
 *
 * One length of tube bent into a shape, which is why the words are set as a
 * shape rather than as a line of text: "The" small and hung above, "Back Room"
 * carrying the weight, the whole piece slightly off square the way a hand-bent
 * sign sits on its hook.
 *
 * It is a component rather than markup repeated in three places because a sign
 * that differs between the wall and the door is two signs.
 */
export function Sign({ className = "" }: { className?: string }) {
  return (
    <span className={`sign ${className}`.trim()} role="img" aria-label="The Back Room">
      <span className="sign__the" aria-hidden="true">
        The
      </span>
      <span className="sign__name" aria-hidden="true">
        Back Room
      </span>
    </span>
  );
}
