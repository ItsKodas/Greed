import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { getVolume, setVolume, unlock } from "../game/audio.js";
import {
  attachMusic,
  musicState,
  setMusicOn,
  setMusicVolume,
  skipTrack,
  watchMusic,
} from "./music.js";

/**
 * Sound, folded into a single button.
 *
 * A pair of sliders on the bar would be two controls nobody touches taking the
 * width of ones they would — so this is a speaker you click to mute and hover
 * to open. Inside are the two things that make noise and have nothing to do
 * with each other: the game, which is ours, and the music, which is a stream
 * from somewhere else.
 *
 * The panel is always in the DOM rather than mounted on hover. A control that
 * appears only once a pointer arrives cannot be reached by a keyboard, and
 * :focus-within opens the same panel for anyone tabbing to it — and the music
 * player must not be unmounted, because rebuilding the iframe would restart
 * the track every time the menu closed.
 */
export function Sound() {
  const [level, setLevel] = useState(() => getVolume());
  const music = useSyncExternalStore(watchMusic, musicState);
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

  // A callback ref, so the player is handed its home the moment there is one.
  const stage = useCallback((node: HTMLDivElement | null) => {
    attachMusic(node);
  }, []);

  return (
    <span className={`vol${muted ? " vol--muted" : ""}`}>
      <button
        type="button"
        className="iconbtn vol__btn"
        aria-label={muted ? "Unmute" : "Sound"}
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

      <div className="vol__pop">
        <div className="vol__row">
          <span className="vol__label">Game</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={level}
            aria-label="Game volume"
            onChange={(event) => {
              const next = Number(event.target.value);
              if (next > 0) {
                before.current = next;
              }
              move(next);
            }}
          />
          <span className="vol__read">{Math.round(level * 100)}</span>
        </div>

        <div className="vol__row">
          <span className="vol__label">Music</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={music.volume}
            aria-label="Music volume"
            onChange={(event) => setMusicVolume(Number(event.target.value))}
          />
          <span className="vol__read">{Math.round(music.volume * 100)}</span>
        </div>

        <div className="vol__music">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setMusicOn(!music.on)}
          >
            {music.on ? "Stop" : "Play"}
          </button>
          <button
            type="button"
            className="iconbtn"
            aria-label="Next track"
            title="Next track"
            disabled={!music.on}
            onClick={skipTrack}
          >
            <SkipIcon />
          </button>
          <span className="vol__now">
            {music.failed
              ? "the stream would not load"
              : !music.on
                ? "off"
                : (music.title ?? "finding something…")}
          </span>
        </div>

        {/* Kept in the layout rather than hidden: a stream is somebody else's
            player and is meant to be seen, not run as a hidden source. */}
        <div className={`vol__stage${music.on ? "" : " vol__stage--off"}`} ref={stage} />
      </div>
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

function SkipIcon() {
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
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}
