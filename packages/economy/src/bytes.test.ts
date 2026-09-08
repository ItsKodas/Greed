import { Binary } from "bson";
import { describe, expect, it } from "vitest";
import { bytesOf } from "./mongo-store.js";

/**
 * Reading bytes back out of a binary field.
 *
 * This is here because of a bug that served every emote as an empty file while
 * answering 200 with the right content type: a broken image and a silent
 * sound, and nothing in any log saying why. The whole of it was that
 * `.lean()` returns a BSON `Binary` rather than a `Buffer`, and `Binary` has a
 * `length` *method* — so `Uint8Array.from` read `.length` as a number, got
 * `NaN` from a function, and returned an empty array without complaint.
 *
 * The first test below is the one that was missing. It fails against the old
 * `Uint8Array.from(doc.image)` with exactly the symptom that reached
 * production: zero bytes, no error.
 */

const REAL = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

describe("bytesOf", () => {
  /* The shape the driver actually hands back, and the one that was broken. */
  it("reads a BSON Binary, which is what a lean query returns", () => {
    expect(bytesOf(new Binary(Buffer.from(REAL)))).toEqual(REAL);
  });

  it("reads a Buffer", () => {
    expect(bytesOf(Buffer.from(REAL))).toEqual(REAL);
  });

  it("reads a plain Uint8Array", () => {
    expect(bytesOf(REAL)).toEqual(REAL);
  });

  it("reads a Buffer that has been through JSON", () => {
    expect(bytesOf({ type: "Buffer", data: [...REAL] })).toEqual(REAL);
  });

  it("copies rather than handing back the caller's own array", () => {
    const source = Uint8Array.from(REAL);
    const read = bytesOf(source);
    source[0] = 0;
    expect(read[0]).toBe(0xff);
  });

  it("keeps every byte of something larger than a handful", () => {
    const big = Uint8Array.from({ length: 5000 }, (_, index) => index % 256);
    expect(bytesOf(new Binary(Buffer.from(big)))).toEqual(big);
  });

  /*
   * Loud rather than quiet. An unreadable shape becoming an empty file is
   * precisely how this went unnoticed: the response was a valid 200 with the
   * right content type and nothing in it.
   */
  it("throws on a shape it does not understand, rather than returning nothing", () => {
    expect(() => bytesOf(null)).toThrow(TypeError);
    expect(() => bytesOf(undefined)).toThrow(TypeError);
    expect(() => bytesOf({})).toThrow(TypeError);
    expect(() => bytesOf("not bytes")).toThrow(TypeError);
    expect(() => bytesOf(42)).toThrow(TypeError);
  });
});
