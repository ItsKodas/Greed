/**
 * The game's sound.
 *
 * Two sources, deliberately. Recorded samples for the physical sounds — dice
 * on wood is not something synthesis does convincingly — and Web Audio for the
 * interface, where a synthesised tone is smaller, needs no files, and can be
 * pitch-varied per press so repeats never sound machine-gunned.
 */

export type Cue =
  | "shake"
  | "land"
  | "pick"
  | "drop"
  | "bank"
  | "farkle"
  | "greed"
  | "hotDice"
  | "yourTurn"
  | "win"
  /* Cards. A hand going out, one card landing, and the hole card turning. */
  | "deal"
  | "card"
  | "reveal"
  /* Money, in both directions: staked, and counted back to you. */
  | "bet"
  | "payout";

interface Manifest {
  dice?: string[];
  cards?: string[];
  chips?: string[];
  ui?: string[];
  stingers?: string[];
  ambience?: string[];
}

const VOLUME_KEY = "backroom.volume";
const MUTED_KEY = "backroom.muted";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let samples: Manifest = {};
let ready = false;
/** Files already fetched and decoded, by URL. */
const decoded = new Map<string, AudioBuffer>();
/**
 * Files fetched but not yet decoded.
 *
 * Fetching needs nothing from the browser; decoding needs an AudioContext, and
 * a browser will not give us one until the player has touched the page. So the
 * two are split: bytes are pulled as soon as the page loads, and turned into
 * buffers the moment we are allowed to. On a server across an ocean that is
 * the difference between a die landing silently and landing with a knock.
 */
const fetched = new Map<string, ArrayBuffer>();
let preloading: Promise<void> | null = null;

function readVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        return value;
      }
    }
  } catch {
    // ignore
  }
  return 0.7;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

let volume = readVolume();
/**
 * Everything off, without moving anything.
 *
 * Kept apart from the volume rather than expressed as a volume of zero: mute
 * is a switch and a level is a level, and collapsing the two means unmuting
 * has to guess where the slider used to be — a guess that does not survive a
 * reload. It is also the master switch for the music, which has no volume of
 * ours to set to zero.
 */
let muted = readMuted();

function applyGain(): void {
  if (master !== null) {
    master.gain.value = muted ? 0 : volume;
  }
}

export function getVolume(): number {
  return volume;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  applyGain();
  try {
    window.localStorage.setItem(MUTED_KEY, String(next));
  } catch {
    // ignore
  }
}

export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  applyGain();
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // ignore
  }
}

/**
 * Browsers refuse to start audio until the user has interacted with the page,
 * so this is called from the first click rather than on load.
 */
export function unlock(): void {
  if (context !== null) {
    void context.resume();
    return;
  }
  try {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(context.destination);
    // Anything already downloaded can become playable right now; anything not
    // yet asked for gets asked for here.
    void preload().then(decodeWaiting);
  } catch {
    context = null;
  }
}

async function loadManifest(): Promise<void> {
  try {
    const response = await fetch("/audio/manifest.json");
    if (!response.ok) {
      return;
    }
    samples = (await response.json()) as Manifest;
    ready = true;
  } catch {
    // No samples is fine — the synthesised cues still work.
  }
}

/** Every sample the manifest names, in one flat list. */
function everySample(): string[] {
  return Object.values(samples).flatMap((list) => list ?? []);
}

/**
 * Pulls every sample down ahead of time.
 *
 * Worth doing eagerly because the whole set is a few hundred kilobytes, and
 * because the cost of not doing it is paid per file rather than once: a cue
 * picks a random file from its group, so without this the first roll, the
 * second, and the third each stall on a different download.
 *
 * Safe to call more than once; safe to call before any sound is wanted.
 */
export function preload(): Promise<void> {
  preloading ??= (async () => {
    if (!ready) {
      await loadManifest();
    }
    await Promise.all(
      everySample().map(async (url) => {
        if (fetched.has(url) || decoded.has(url)) {
          return;
        }
        try {
          const response = await fetch(url);
          if (response.ok) {
            fetched.set(url, await response.arrayBuffer());
          }
        } catch {
          // A sample that will not download is not worth failing over; the
          // cue falls back to its synthesised voice.
        }
      }),
    );
    // If the player has already touched the page, there is a context waiting.
    await decodeWaiting();
  })();
  return preloading;
}

/** Turns whatever has been fetched into buffers, once there is a context. */
async function decodeWaiting(): Promise<void> {
  if (context === null) {
    return;
  }
  for (const [url, bytes] of [...fetched]) {
    try {
      // decodeAudioData detaches the buffer, so hand it a copy: a failed
      // decode must not leave an unusable husk behind in the cache.
      decoded.set(url, await context.decodeAudioData(bytes.slice(0)));
      fetched.delete(url);
    } catch {
      fetched.delete(url);
    }
  }
}

async function buffer(url: string): Promise<AudioBuffer | null> {
  const cached = decoded.get(url);
  if (cached !== undefined) {
    return cached;
  }
  if (context === null) {
    return null;
  }
  // Downloaded already but not yet decoded — the common case for a cue that
  // fires in the same moment the player first touches the page.
  const waiting = fetched.get(url);
  if (waiting !== undefined) {
    try {
      const audio = await context.decodeAudioData(waiting.slice(0));
      fetched.delete(url);
      decoded.set(url, audio);
      return audio;
    } catch {
      fetched.delete(url);
      return null;
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    decoded.set(url, audio);
    return audio;
  } catch {
    return null;
  }
}

function pick(list: string[] | undefined): string | null {
  if (list === undefined || list.length === 0) {
    return null;
  }
  return list[Math.floor(Math.random() * list.length)] ?? null;
}

/**
 * The files in a list whose names mention a word, or all of them if none do.
 *
 * Naming a file "diceshake2.mp3" or "placing_chips1.mp3" is a hint, not a
 * requirement — drop in a pile of unnamed clips and they still all play, just
 * without the split. That is what keeps the drop-a-file workflow honest: a
 * folder is never wrong, it is only ever less specific.
 *
 * Exported because this is the seam that fails quietly. A renamed file does
 * not break anything; it just stops matching, falls back to the whole folder,
 * and the wrong sound plays forever without a single error.
 */
export function preferring(files: readonly string[], word: string): string[] {
  const matching = files.filter((url) => url.toLowerCase().includes(word));
  return matching.length > 0 ? matching : [...files];
}

function pickNamed(group: keyof Manifest, word: string): string | null {
  const all = samples[group];
  if (all === undefined || all.length === 0) {
    return null;
  }
  return pick(preferring(all, word));
}

/** Plays a sample with a little pitch variation so repeats stay alive. */
async function sample(url: string | null, gain: number): Promise<boolean> {
  if (!ready || context === null || master === null) {
    return false;
  }
  if (url === null) {
    return false;
  }
  const audio = await buffer(url);
  if (audio === null || context === null || master === null) {
    return false;
  }
  const source = context.createBufferSource();
  source.buffer = audio;
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(level).connect(master);
  source.start();
  return true;
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Slide to this frequency across the note. */
  to?: number;
  delay?: number;
}

function tone(options: ToneOptions): void {
  if (context === null || master === null) {
    return;
  }
  const { frequency, duration, type = "sine", gain = 0.2, to, delay = 0 } = options;
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const level = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  }
  level.gain.setValueAtTime(0.0001, start);
  level.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(level).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A short filtered noise burst: the basis of every click and thud. */
function noise(duration: number, frequency: number, gain: number): void {
  if (context === null || master === null) {
    return;
  }
  const frames = Math.floor(context.sampleRate * duration);
  const buf = context.createBuffer(1, frames, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
  }
  const source = context.createBufferSource();
  source.buffer = buf;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(filter).connect(level).connect(master);
  source.start();
}

export function play(cue: Cue): void {
  if (context === null || master === null || muted || volume === 0) {
    return;
  }
  switch (cue) {
    case "shake":
      // The throw. Recorded if we have one, a rattle of noise if not.
      void sample(pickNamed("dice", "shake"), 0.85).then((played) => {
        if (!played) {
          for (let hit = 0; hit < 6; hit += 1) {
            window.setTimeout(() => noise(0.04, 1100 + Math.random() * 800, 0.16), hit * 70);
          }
        }
      });
      break;
    case "land":
      void sample(pickNamed("dice", "roll"), 0.9).then((played) => {
        if (!played) {
          for (let hit = 0; hit < 4; hit += 1) {
            window.setTimeout(() => noise(0.05, 800 + Math.random() * 600, 0.22), hit * 45);
          }
        }
      });
      break;
    case "pick":
      noise(0.03, 2200, 0.18);
      tone({ frequency: 880, duration: 0.05, type: "triangle", gain: 0.07 });
      break;
    case "drop":
      noise(0.03, 1400, 0.12);
      break;
    case "bank":
      void sample(pickNamed("chips", "placing"), 0.8).then((played) => {
        if (!played) {
          tone({ frequency: 520, duration: 0.12, type: "triangle", gain: 0.16 });
          tone({ frequency: 780, duration: 0.16, type: "triangle", gain: 0.14, delay: 0.08 });
        }
      });
      break;
    case "farkle":
      tone({ frequency: 220, to: 70, duration: 0.5, type: "sawtooth", gain: 0.14 });
      noise(0.25, 260, 0.2);
      break;
    case "greed": {
      // One note per letter, climbing, timed to the dice revealing in turn —
      // then a bell over the top once the word is complete.
      const ladder = [392, 494, 587, 659, 784, 988];
      ladder.forEach((frequency, step) => {
        tone({ frequency, duration: 0.5, type: "triangle", gain: 0.16, delay: step * 0.11 });
        tone({ frequency: frequency * 2, duration: 0.3, gain: 0.05, delay: step * 0.11 });
      });
      tone({ frequency: 1568, duration: 1.1, gain: 0.09, delay: 0.68 });
      tone({ frequency: 2350, duration: 0.9, gain: 0.04, delay: 0.7 });
      break;
    }
    case "hotDice":
      [523, 659, 784, 1046].forEach((frequency, step) => {
        tone({ frequency, duration: 0.16, type: "triangle", gain: 0.13, delay: step * 0.07 });
      });
      break;
    case "yourTurn":
      // A small brass bell: fundamental plus a fifth above it.
      tone({ frequency: 784, duration: 0.5, gain: 0.12 });
      tone({ frequency: 1176, duration: 0.4, gain: 0.06, delay: 0.01 });
      break;
    case "win":
      [523, 659, 784, 1046, 1318].forEach((frequency, step) => {
        tone({ frequency, duration: 0.35, type: "triangle", gain: 0.14, delay: step * 0.11 });
      });
      break;

    /*
     * A whole hand going out, rather than one card.
     *
     * Six cards played from a single sample would machine-gun even with the
     * pitch wobble, so this draws a fresh file per card from the entire card
     * folder — placing and taking alike — and staggers them unevenly. A dealer
     * does not deal on a metronome.
     */
    case "deal": {
      const cards = samples.cards ?? [];
      const count = cards.length === 0 ? 0 : 4;
      for (let index = 0; index < count; index += 1) {
        const delay = index * 135 + Math.random() * 50;
        /*
         * Quieter than a single card on purpose. These clips run about half a
         * second each and the stagger is shorter than that, so three of them
         * are sounding at once in the middle of a deal — at the gain one card
         * gets, four of them sum past full scale and clip.
         */
        window.setTimeout(() => void sample(pick(cards), 0.38), delay);
      }
      if (count === 0) {
        for (let hit = 0; hit < 4; hit += 1) {
          window.setTimeout(() => noise(0.03, 1600 + Math.random() * 500, 0.1), hit * 110);
        }
      }
      break;
    }

    // One card off the shoe: a hit, a double, or the dealer drawing.
    case "card":
      void sample(pickNamed("cards", "taking"), 0.7).then((played) => {
        if (!played) {
          noise(0.035, 1700, 0.12);
        }
      });
      break;

    // The hole card turned over, which is the moment the hand is decided.
    case "reveal":
      void sample(pickNamed("cards", "placing"), 0.8).then((played) => {
        if (!played) {
          noise(0.05, 900, 0.16);
        }
      });
      break;

    // Chips onto the felt.
    case "bet":
      void sample(pickNamed("chips", "placing"), 0.75).then((played) => {
        if (!played) {
          noise(0.04, 2400, 0.12);
          tone({ frequency: 660, duration: 0.06, type: "triangle", gain: 0.06 });
        }
      });
      break;

    /*
     * Chips counted back to you. Only ever on the way in — a loss is silence,
     * which is both cheaper to listen to and truer to a table.
     */
    case "payout":
      void sample(pickNamed("chips", "counting"), 0.85).then((played) => {
        if (!played) {
          [660, 880].forEach((frequency, step) => {
            tone({ frequency, duration: 0.18, type: "triangle", gain: 0.12, delay: step * 0.09 });
          });
        }
      });
      break;
  }
}
