import type { SeatView } from "@greed/shared";
import { useState } from "react";

/**
 * Discord gives an accent colour as a 24-bit number. Null means they never set
 * one, and the room's own blue is a better answer than a made-up colour.
 */
export function accentOf(accentColor: number | null): string | undefined {
  if (accentColor === null) {
    return undefined;
  }
  return `#${accentColor.toString(16).padStart(6, "0")}`;
}

/**
 * Someone's picture, or their initial when they have none.
 *
 * A missing picture is not a failure worth showing: Discord accounts without
 * one are ordinary, and a monogram in the table's own palette sits better here
 * than a default blue circle. A picture that fails to load falls back to the
 * same monogram rather than leaving a broken frame.
 */
export function Avatar({
  name,
  avatar,
  accentColor,
  className = "seat__avatar",
}: {
  name: string;
  avatar: string | null;
  accentColor: number | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const accent = accentOf(accentColor);
  const showImage = avatar !== null && !broken;

  return (
    <div className={className} style={accent === undefined ? undefined : { borderColor: accent }}>
      {showImage ? (
        <img
          className="avatar__image"
          src={avatar}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

/** The same, from a seat at the table. */
export function SeatAvatar({ seat }: { seat: SeatView }) {
  return <Avatar name={seat.name} avatar={seat.avatar} accentColor={seat.accentColor} />;
}
