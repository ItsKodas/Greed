/**
 * The room's music, streamed from a YouTube playlist.
 *
 * Separate from audio.ts on purpose. That file is the game's own sound — short
 * samples and synthesised cues, played through one Web Audio graph we own.
 * This is somebody else's stream in somebody else's player, with its own
 * volume, its own failure modes and its own rules, and the two only meet at
 * the sliders in the navbar.
 *
 * Two things worth knowing about the embed. It must be allowed to remain
 * visible — YouTube's API terms are about a player people can see, not a
 * hidden audio source — so the player is rendered rather than tucked away.
 * And a browser will not start audible playback without a gesture, which is
 * why music is off until somebody turns it on: the press that turns it on is
 * the gesture, so there is no autoplay problem to work around.
 */

const PLAYLIST = "PLDsQbZPR0jf4noTT0HceGJzcathrVAz9c";
const VOLUME_KEY = "backroom.music.volume";
const ON_KEY = "backroom.music.on";

/** Only the handful of player methods this file actually calls. */
interface Player {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  setVolume(percent: number): void;
  setShuffle(on: boolean): void;
  setLoop(on: boolean): void;
  getPlaylist(): string[] | undefined;
  playVideoAt(index: number): void;
  getVideoData(): { title?: string } | undefined;
  destroy(): void;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      height: string;
      width: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError?: () => void;
      };
    },
  ) => Player;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface MusicState {
  on: boolean;
  volume: number;
  /** True once the stream is actually sounding, which lags the switch. */
  playing: boolean;
  /** What is on, when the player has told us. */
  title: string | null;
  /** Set when the embed could not be loaded or refused to play. */
  failed: boolean;
}

let player: Player | null = null;
let loading: Promise<void> | null = null;
let host: HTMLElement | null = null;

const state: MusicState = {
  on: read(ON_KEY, "false") === "true",
  volume: clamp(Number(read(VOLUME_KEY, "0.35"))),
  playing: false,
  title: null,
  failed: false,
};

const watchers = new Set<() => void>();

/*
 * A frozen copy handed to React, replaced only when something changes.
 *
 * useSyncExternalStore compares snapshots by identity: returning a fresh
 * object each time it asks would look like a change on every render and spin
 * forever. So the copy is made when the state moves, not when it is read.
 */
let snapshot: MusicState = { ...state };

function read(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that will not remember is not a reason to refuse to play.
  }
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.35;
}

function announce(): void {
  snapshot = { ...state };
  for (const watcher of watchers) {
    watcher();
  }
}

export function musicState(): MusicState {
  return snapshot;
}

export function watchMusic(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * Loads YouTube's player script, once.
 *
 * The API announces itself through a single global callback, so anything else
 * that wanted it would be clobbered — nothing else does, and this is the note
 * that says so rather than a surprise later.
 */
function loadApi(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    if (window.YT?.Player !== undefined) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("the music player would not load"));
    document.head.append(script);
  });
  return loading;
}

/**
 * Where the player should be drawn.
 *
 * Called by whatever is rendering the controls. The element is remembered so
 * that a player built later still knows where to go, and a player already
 * built is moved rather than rebuilt — remounting the iframe would restart the
 * track every time the menu opened.
 */
export function attachMusic(element: HTMLElement | null): void {
  host = element;
  if (element !== null && player !== null) {
    const frame = document.getElementById("music-frame");
    if (frame !== null && frame.parentElement !== element) {
      element.append(frame);
    }
  }
  if (element !== null && state.on && player === null) {
    void build();
  }
}

async function build(): Promise<void> {
  if (player !== null || host === null) {
    return;
  }
  try {
    await loadApi();
  } catch {
    state.failed = true;
    announce();
    return;
  }
  const api = window.YT;
  if (api?.Player === undefined || host === null) {
    state.failed = true;
    announce();
    return;
  }

  const mount = document.createElement("div");
  mount.id = "music-frame";
  host.append(mount);

  player = new api.Player(mount, {
    width: "220",
    height: "124",
    playerVars: {
      listType: "playlist",
      list: PLAYLIST,
      // No autoplay: the press that turned the music on is the gesture, and
      // playVideo is called from onReady rather than asked for here.
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        player?.setVolume(Math.round(state.volume * 100));
        player?.setLoop(true);
        player?.setShuffle(true);
        start();
      },
      onStateChange: (event) => {
        const playing = event.data === (window.YT?.PlayerState.PLAYING ?? 1);
        state.playing = playing;
        const title = player?.getVideoData()?.title;
        state.title = typeof title === "string" && title.length > 0 ? title : null;
        announce();
      },
      onError: () => {
        // One dead video should not end the night; the playlist moves on.
        player?.nextVideo();
      },
    },
  });
}

/**
 * Starts somewhere other than the top.
 *
 * setShuffle alone is unreliable before a playlist has loaded, and even when
 * it takes it leaves the first track playing first — so the opening track is
 * chosen here as well. Between the two, two people opening the room at the
 * same time are not listening to the same thing.
 */
function start(): void {
  if (player === null) {
    return;
  }
  const list = player.getPlaylist();
  if (Array.isArray(list) && list.length > 1) {
    player.playVideoAt(Math.floor(Math.random() * list.length));
  } else {
    player.playVideo();
  }
}

export function setMusicOn(on: boolean): void {
  state.on = on;
  state.failed = false;
  write(ON_KEY, String(on));
  announce();
  if (!on) {
    player?.pauseVideo();
    return;
  }
  if (player === null) {
    void build();
  } else {
    player.playVideo();
  }
}

export function setMusicVolume(next: number): void {
  state.volume = clamp(next);
  write(VOLUME_KEY, String(state.volume));
  player?.setVolume(Math.round(state.volume * 100));
  announce();
}

/** On to the next track, for when this one is not it. */
export function skipTrack(): void {
  player?.nextVideo();
}
