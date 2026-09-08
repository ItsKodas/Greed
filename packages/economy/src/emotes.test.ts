import { describe, expect, it } from "vitest";
import {
  MAX_EMOTE_COST,
  MAX_EMOTE_NAME,
  MAX_IMAGE_BYTES,
  MAX_SOUND_BYTES,
  judgeEmote,
  sniffImage,
  sniffSound,
} from "./emotes.js";
import type { NewEmote } from "./emotes.js";

/** A file that begins with `magic` and is `length` bytes long. */
function file(magic: readonly number[], length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(magic.slice(0, length));
  return bytes;
}

const ascii = (text: string): number[] => [...text].map((letter) => letter.charCodeAt(0));

const GIF = file(ascii("GIF89a"));
const PNG = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = file([0xff, 0xd8, 0xff, 0xe0]);
const MP3 = file(ascii("ID3"));

/** A RIFF container whose four-byte form tag is `form`. */
function riff(form: string): Uint8Array {
  const bytes = file(ascii("RIFF"));
  bytes.set(ascii(form), 8);
  return bytes;
}

function upload(over: Partial<NewEmote> = {}): NewEmote {
  return {
    name: "Smug",
    cost: 250,
    image: GIF,
    sound: null,
    createdBy: "admin-1",
    ...over,
  };
}

describe("sniffImage", () => {
  it("reads the four picture formats off their magic bytes", () => {
    expect(sniffImage(GIF)).toBe("image/gif");
    expect(sniffImage(file(ascii("GIF87a")))).toBe("image/gif");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(riff("WEBP"))).toBe("image/webp");
  });

  it("refuses anything that is not one of them", () => {
    expect(sniffImage(file(ascii("not a picture")))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    // A RIFF container that is a sound, not a picture.
    expect(sniffImage(riff("WAVE"))).toBeNull();
  });

  /*
   * The one that matters. An SVG is a document that may contain a script, and
   * serving one from this origin would run it in every player's session — so
   * the refusal is the security property, not an oversight to be fixed later.
   */
  it("refuses SVG, however it is dressed", () => {
    expect(sniffImage(file(ascii("<svg xmlns=")))).toBeNull();
    expect(sniffImage(file(ascii("<?xml version=")))).toBeNull();
    expect(sniffImage(file(ascii("<!DOCTYPE svg")))).toBeNull();
  });

  it("is not fooled by the magic bytes appearing later in the file", () => {
    const late = new Uint8Array(64);
    late.set(ascii("GIF89a"), 8);
    expect(sniffImage(late)).toBeNull();
  });

  it("refuses a file too short to hold the magic it claims", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImage(Uint8Array.from(ascii("RIFF")))).toBeNull();
  });
});

describe("sniffSound", () => {
  it("reads the three sound formats", () => {
    expect(sniffSound(MP3)).toBe("audio/mpeg");
    // A bare MPEG frame header, for a file carrying no ID3 tag.
    expect(sniffSound(file([0xff, 0xfb]))).toBe("audio/mpeg");
    expect(sniffSound(file(ascii("OggS")))).toBe("audio/ogg");
    expect(sniffSound(riff("WAVE"))).toBe("audio/wav");
  });

  it("refuses a picture handed in as a sound", () => {
    expect(sniffSound(GIF)).toBeNull();
    expect(sniffSound(riff("WEBP"))).toBeNull();
  });
});

describe("judgeEmote", () => {
  it("passes a named picture with a sensible cost", () => {
    const judged = judgeEmote(upload());
    expect(judged).toEqual({
      ok: true,
      emote: { name: "Smug", cost: 250, imageMime: "image/gif", soundMime: null },
    });
  });

  it("keeps the sound when there is one", () => {
    const judged = judgeEmote(upload({ sound: MP3 }));
    expect(judged.ok && judged.emote.soundMime).toBe("audio/mpeg");
  });

  it("treats an empty sound as no sound rather than a bad one", () => {
    const judged = judgeEmote(upload({ sound: new Uint8Array(0) }));
    expect(judged.ok && judged.emote.soundMime).toBeNull();
  });

  it("trims the name", () => {
    const judged = judgeEmote(upload({ name: "  Smug  " }));
    expect(judged.ok && judged.emote.name).toBe("Smug");
  });

  it("refuses a name that is blank or only spaces", () => {
    expect(judgeEmote(upload({ name: "" }))).toEqual({ ok: false, reason: "no-name" });
    expect(judgeEmote(upload({ name: "   " }))).toEqual({ ok: false, reason: "no-name" });
  });

  it("refuses a name longer than the picker can show", () => {
    const judged = judgeEmote(upload({ name: "x".repeat(MAX_EMOTE_NAME + 1) }));
    expect(judged).toEqual({ ok: false, reason: "name-too-long" });
  });

  it("allows a free emote but refuses a negative or fractional price", () => {
    expect(judgeEmote(upload({ cost: 0 })).ok).toBe(true);
    expect(judgeEmote(upload({ cost: -1 }))).toEqual({ ok: false, reason: "bad-cost" });
    expect(judgeEmote(upload({ cost: 12.5 }))).toEqual({ ok: false, reason: "bad-cost" });
    expect(judgeEmote(upload({ cost: Number.NaN }))).toEqual({ ok: false, reason: "bad-cost" });
    expect(judgeEmote(upload({ cost: MAX_EMOTE_COST + 1 }))).toEqual({
      ok: false,
      reason: "bad-cost",
    });
  });

  it("refuses an upload with no picture at all", () => {
    expect(judgeEmote(upload({ image: new Uint8Array(0) }))).toEqual({
      ok: false,
      reason: "no-image",
    });
  });

  it("refuses a picture over the size cap", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(ascii("GIF89a"));
    expect(judgeEmote(upload({ image: huge }))).toEqual({ ok: false, reason: "image-too-big" });
  });

  it("refuses a sound over its own, smaller cap", () => {
    const huge = new Uint8Array(MAX_SOUND_BYTES + 1);
    huge.set(ascii("ID3"));
    expect(judgeEmote(upload({ sound: huge }))).toEqual({ ok: false, reason: "sound-too-big" });
  });

  /*
   * Size is checked before shape, so an enormous file is refused without its
   * contents being examined at all. Asserted rather than assumed because the
   * order is the protection: sniffing a gigabyte first is the denial of
   * service the cap exists to prevent.
   */
  it("refuses an oversized file for its size, not its contents", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(ascii("this is not a picture either"));
    expect(judgeEmote(upload({ image: huge }))).toEqual({ ok: false, reason: "image-too-big" });
  });

  it("refuses a picture that is not one, whatever it was called", () => {
    expect(judgeEmote(upload({ image: file(ascii("<svg>alert()</svg>")) }))).toEqual({
      ok: false,
      reason: "image-not-an-image",
    });
  });

  it("refuses a sound that is not one", () => {
    expect(judgeEmote(upload({ sound: GIF }))).toEqual({
      ok: false,
      reason: "sound-not-a-sound",
    });
  });
});
