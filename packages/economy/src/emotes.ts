/**
 * Emotes: the pictures players pay to throw at each other.
 *
 * Everything here is about the file itself rather than about the taunt. What a
 * taunt costs, who it was aimed at and where the chips go is the table's
 * business — see `packages/core/src/taunts.ts` — and this file only answers
 * one question, suspiciously: is this upload really the kind of thing it
 * claims to be?
 *
 * That suspicion is the point. An admin upload is the one path in this
 * building where a file somebody chose is later served back to every player,
 * and a picture that is secretly a script is a picture that runs in their
 * session. So nothing here trusts a filename, an extension, or the
 * `Content-Type` a browser volunteered: the bytes are read, and they have to
 * say it themselves.
 */

/** What a picture may be. */
export type ImageMime = "image/gif" | "image/png" | "image/jpeg" | "image/webp";

/** What a sound may be. */
export type SoundMime = "audio/mpeg" | "audio/ogg" | "audio/wav";

/**
 * The biggest a picture may be.
 *
 * Two megabytes is a generous GIF and a mean video, which is the line being
 * drawn: an emote is a reaction, not a clip. It also keeps the whole record
 * inside MongoDB's 16MB document limit with room to spare, so a picture and
 * its sound live in the document rather than needing GridFS and a second thing
 * to go wrong.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * The biggest a sound may be.
 *
 * Smaller than the picture on purpose. This plays over a hand somebody is
 * concentrating on, so a taunt that lasts longer than the reaction to it is a
 * taunt that outstays its welcome — and a megabyte of MP3 is already several
 * seconds more than that.
 */
export const MAX_SOUND_BYTES = 1024 * 1024;

/** The longest an emote's name may be, so the picker stays readable. */
export const MAX_EMOTE_NAME = 24;

/** The most an admin may charge for one throw. */
export const MAX_EMOTE_COST = 1_000_000;

/**
 * An emote as the room lists it — everything except the bytes.
 *
 * Kept apart from the files deliberately. The catalogue is fetched by every
 * client that opens a table, and a list carrying two megabytes an entry is a
 * page that never loads.
 */
export interface EmoteRecord {
  id: string;
  name: string;
  /** What one throw costs the player, in chips. */
  cost: number;
  imageMime: ImageMime;
  /** Null for an emote that is seen and not heard. A sound is optional. */
  soundMime: SoundMime | null;
  imageBytes: number;
  soundBytes: number | null;
  createdBy: string;
  createdAt: number;
  /**
   * Withdrawn rather than deleted.
   *
   * A retired emote stops being offered but keeps answering for its own
   * picture, because it may still be sitting in somebody's bonus pool waiting
   * to be replayed at the person who threw it. Deleting the file would turn
   * that replay into a broken image a week later.
   */
  retired: boolean;
}

/** One file, as it is stored and as it is served back. */
export interface EmoteAsset {
  mime: ImageMime | SoundMime;
  bytes: Uint8Array;
}

/** What an upload has to supply. */
export interface NewEmote {
  name: string;
  cost: number;
  image: Uint8Array;
  sound: Uint8Array | null;
  createdBy: string;
}

export type EmoteRefusal =
  | "no-name"
  | "name-too-long"
  | "bad-cost"
  | "no-image"
  | "image-too-big"
  | "image-not-an-image"
  | "sound-too-big"
  | "sound-not-a-sound";

/** Why an upload was refused, in the words the admin sees. */
export const REFUSALS: Record<EmoteRefusal, string> = {
  "no-name": "Give it a name.",
  "name-too-long": `A name is at most ${MAX_EMOTE_NAME} characters.`,
  "bad-cost": `A cost is a whole number of chips, up to ${MAX_EMOTE_COST}.`,
  "no-image": "An emote needs a picture.",
  "image-too-big": "That picture is over 2MB.",
  "image-not-an-image": "That file is not a GIF, PNG, JPEG or WebP.",
  "sound-too-big": "That sound is over 1MB.",
  "sound-not-a-sound": "That file is not an MP3, OGG or WAV.",
};

/** True when every byte of `magic` sits at the front of `bytes`. */
function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((byte, index) => bytes[index] === byte);
}

/** True when those bytes spell `text` in ASCII at that offset. */
function tagAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) {
    return false;
  }
  return [...text].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
}

/**
 * What this picture actually is, or null if it is not a picture at all.
 *
 * Read from the bytes rather than taken on trust. Note what is missing:
 * **SVG is not here, and must not be added.** An SVG is a document, it may
 * contain a script, and serving one from this origin would hand an admin — or
 * anyone who ever takes an admin's session — a way to run code in every
 * player's browser. That every accepted format is one which cannot contain a
 * program is the whole argument for letting uploads exist at all.
 */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  // GIF87a and GIF89a, which is what most of these will be.
  if (tagAt(bytes, 0, "GIF87a") || tagAt(bytes, 0, "GIF89a")) {
    return "image/gif";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // Every JPEG opens with a start-of-image marker, whatever follows it.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // A RIFF container that says WEBP four bytes past the length.
  if (tagAt(bytes, 0, "RIFF") && tagAt(bytes, 8, "WEBP")) {
    return "image/webp";
  }
  return null;
}

/** What this sound actually is, or null if it is not one. */
export function sniffSound(bytes: Uint8Array): SoundMime | null {
  // An ID3 tag, or a bare frame header for a file carrying no tag.
  if (tagAt(bytes, 0, "ID3")) {
    return "audio/mpeg";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0) {
    return "audio/mpeg";
  }
  if (tagAt(bytes, 0, "OggS")) {
    return "audio/ogg";
  }
  if (tagAt(bytes, 0, "RIFF") && tagAt(bytes, 8, "WAVE")) {
    return "audio/wav";
  }
  return null;
}

/** An upload that passed, with the types its bytes turned out to be. */
export interface JudgedEmote {
  name: string;
  cost: number;
  imageMime: ImageMime;
  soundMime: SoundMime | null;
}

/**
 * Whether this upload may become an emote.
 *
 * Pure, and separate from storing it, so the rules can be tested against a
 * handful of bytes rather than against a database.
 */
export function judgeEmote(
  input: NewEmote,
): { ok: true; emote: JudgedEmote } | { ok: false; reason: EmoteRefusal } {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, reason: "no-name" };
  }
  if (name.length > MAX_EMOTE_NAME) {
    return { ok: false, reason: "name-too-long" };
  }
  if (!Number.isInteger(input.cost) || input.cost < 0 || input.cost > MAX_EMOTE_COST) {
    return { ok: false, reason: "bad-cost" };
  }
  if (input.image.length === 0) {
    return { ok: false, reason: "no-image" };
  }
  /*
   * Size before shape, so an enormous file is refused without its contents
   * being examined at all.
   */
  if (input.image.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "image-too-big" };
  }
  const imageMime = sniffImage(input.image);
  if (imageMime === null) {
    return { ok: false, reason: "image-not-an-image" };
  }

  let soundMime: SoundMime | null = null;
  // An absent sound and an empty one are the same thing: an emote with none.
  if (input.sound !== null && input.sound.length > 0) {
    if (input.sound.length > MAX_SOUND_BYTES) {
      return { ok: false, reason: "sound-too-big" };
    }
    soundMime = sniffSound(input.sound);
    if (soundMime === null) {
      return { ok: false, reason: "sound-not-a-sound" };
    }
  }

  return { ok: true, emote: { name, cost: input.cost, imageMime, soundMime } };
}
