import { useRef, useState } from "react";
import { getVolume, setVolume, unlock } from "../game/audio.js";

/**
 * Sound, folded into a single button.
 *
 * A slider on the bar is a control nobody touches taking the width of one they
 * would — so this is a speaker you click to mute and hover to adjust. The
 * slider is always in the DOM rather than mounted on hover: a control that
 * appears only after the pointer arrives cannot be reached by a keyboard, and
 * `:focus-within` opens the same panel for anyone tabbing to it.
 */
export function Volume() {
  const [level, setLevel] = useState(() => getVolume());
  /*
   * What to come back to. Muting is not the same as turning it down to
   * nothing: unmuting should return the volume somebody chose, not a default.
   */
  const before = useRef(level > 0 ? level : 0.7);
  const muted = level === 0;

  const move = (next: number) => {
    unlock();
    setVolume(next);
    setLevel(next);
  };

  return (
    <span className={`vol${muted ? " vol--muted" : ""}`}>
      <button
        type="button"
        className="iconbtn vol__btn"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={() => {
          if (muted) {
            move(before.current);
          } else {
            before.current = level;
            move(0);
          }
        }}
      >
        {muted ? <MutedIcon /> : <SpeakerIcon />}
      </button>
      <span className="vol__pop">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={level}
          aria-label="Volume"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next > 0) {
              before.current = next;
            }
            move(next);
          }}
        />
        <span className="vol__read">{Math.round(level * 100)}</span>
      </span>
    </span>
  );
}

function SpeakerIcon() {
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

function MutedIcon() {
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
