/**
 * The table's own signals, drawn.
 *
 * Blackjack is played with the hands as much as with the mouth: you tap the
 * felt for a card and wave a flat hand over it to stand, and a dealer reads
 * the gesture rather than the word. Those two gestures are the two icons —
 * the buttons are labelled, so the drawing's job is a silhouette you learn
 * once and then stop reading.
 *
 * Drawn on the same 24-unit grid, in the same weight, as the rest of the
 * building's icons. No size and no colour of their own: both come from the
 * button they are sitting in, so a disabled control dims its icon with the
 * rest of itself rather than leaving a bright glyph on a grey button.
 */

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A card coming down to the felt: the tap you make asking for one. */
export function HitIcon() {
  return (
    <Glyph>
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </Glyph>
  );
}

/** The flat hand held over the cards, which is how standing is said. */
export function StandIcon() {
  return (
    <Glyph>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V13" />
      {/* The thumb is what makes this a hand rather than a mitten at the size
          it is actually drawn at. */}
      <path d="M9 11V9.5a1.5 1.5 0 0 0-3 0v4.2l-1.3-1.3a1.5 1.5 0 0 0-2.1 2.1l2.6 2.6C6.6 19.1 8.3 20 10.5 20h1C16.8 20 18 17.2 18 13.5" />
    </Glyph>
  );
}

/** A second chip pushed out beside the first. */
export function DoubleIcon() {
  return (
    <Glyph>
      <circle cx="9" cy="15" r="5.5" />
      <circle cx="15" cy="9" r="5.5" />
    </Glyph>
  );
}

/** One hand becoming two. */
export function SplitIcon() {
  return (
    <Glyph>
      <path d="M12 21v-7" />
      <path d="M12 14 6 8" />
      <path d="m12 14 6-6" />
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
    </Glyph>
  );
}

/** A card leaving the shoe. */
export function DealIcon() {
  return (
    <Glyph>
      <rect x="3" y="4" width="10" height="16" rx="2" />
      <path d="M16 12h5" />
      <path d="m18 9 3 3-3 3" />
    </Glyph>
  );
}

/** The stake coming back off the felt. */
export function UndoIcon() {
  return (
    <Glyph>
      <path d="M4 10h11a4.5 4.5 0 0 1 0 9h-5" />
      <path d="m8 6-4 4 4 4" />
    </Glyph>
  );
}

/** What the table is counting down. */
export function ClockIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3 1.8" />
    </Glyph>
  );
}
