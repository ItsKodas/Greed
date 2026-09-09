// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { play, setMuted, spinWheel } from "../game/audio.js";

/**
 * The wheel's sound, where there is nothing to play it with.
 *
 * jsdom has no AudioContext, which is the same position a real browser is in
 * before the player has touched the page — and a table deals itself, so the
 * first spin somebody sees can easily happen before they have clicked
 * anything. Silence is the right answer to that; an exception is not, because
 * it would take the felt down with it.
 */
describe("the wheel's sound when it cannot be heard", () => {
  it("hands back a way to stop a spin that never started", () => {
    const stop = spinWheel({ spinMs: 7_000, rimAt: 0.82, dropAt: 0.55 });
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });

  it("survives being stopped twice, which is what a remount does", () => {
    const stop = spinWheel({ spinMs: 7_000, rimAt: 0.82, dropAt: 0.55 });
    stop();
    expect(() => stop()).not.toThrow();
  });

  it("says nothing at all when the player has muted the room", () => {
    setMuted(true);
    expect(() => spinWheel({ spinMs: 7_000, rimAt: 0.82, dropAt: 0.55 })()).not.toThrow();
    setMuted(false);
  });

  it("takes the wheel's own cues without complaint", () => {
    // Every sound in the building goes through one place, so a cue this file
    // added and the switch never handled would be a silent nothing.
    expect(() => play("noMoreBets")).not.toThrow();
    expect(() => play("numberUp")).not.toThrow();
  });
});
