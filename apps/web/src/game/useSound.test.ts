import type { RoomView, SeatView } from "@backroom/shared";
import { describe, expect, it } from "vitest";
import { someoneBanked } from "./useSound.js";

function seat(id: string, score: number): SeatView {
  return {
    id,
    name: id,
    score,
    onBoard: score > 0,
    connected: true,
    isHost: id === "a",
    isBot: false,
    signedIn: true,
    waiting: false,
    avatar: null,
    accentColor: null,
  };
}

function room(seats: SeatView[]): RoomView {
  return {
    code: "TEST1",
    status: "playing",
    seats,
    watching: 0,
    turn: null,
    ruleset: { name: "Classic" } as RoomView["ruleset"],
    buyIn: 0,
    pot: 0,
    winnerIds: [],
    lastEvent: null,
  };
}

describe("noticing that somebody banked", () => {
  it("hears a score go up", () => {
    expect(someoneBanked(room([seat("a", 0)]), room([seat("a", 750)]))).toBe(true);
  });

  it("hears it at a table of one", () => {
    /*
     * The bug this exists for. Banking used to be read off the turn moving to
     * another seat, and at a table of one it steps `(0 + 1) % 1` and comes
     * back to the same seat — so practising alone was silent, and so was any
     * table where everyone else had dropped or was waiting for the next game.
     */
    const alone = [seat("a", 1200)];
    expect(someoneBanked(room([seat("a", 0)]), room(alone))).toBe(true);
  });

  it("hears somebody else's, not only your own", () => {
    const before = room([seat("a", 500), seat("b", 500)]);
    const after = room([seat("a", 500), seat("b", 1250)]);
    expect(someoneBanked(before, after)).toBe(true);
  });

  it("stays quiet when nothing was banked", () => {
    const same = [seat("a", 500), seat("b", 300)];
    expect(someoneBanked(room(same), room([seat("a", 500), seat("b", 300)]))).toBe(false);
  });

  it("stays quiet on a farkle", () => {
    // Losing a turn is not banking, and a score that does not move says so
    // without needing to be told what a farkle is.
    expect(someoneBanked(room([seat("a", 500)]), room([seat("a", 500)]))).toBe(false);
  });

  it("says nothing about the very first state", () => {
    expect(someoneBanked(null, room([seat("a", 0)]))).toBe(false);
  });

  it("is not fooled by somebody new arriving with a score of zero", () => {
    // A seat that was not there before has nothing to compare against, so it
    // cannot have banked — otherwise every arrival would rattle chips.
    const before = room([seat("a", 500)]);
    const after = room([seat("a", 500), seat("b", 0)]);
    expect(someoneBanked(before, after)).toBe(false);
  });

  it("is not fooled by a seat leaving", () => {
    const before = room([seat("a", 500), seat("b", 900)]);
    const after = room([seat("a", 500)]);
    expect(someoneBanked(before, after)).toBe(false);
  });
});
