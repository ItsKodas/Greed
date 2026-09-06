import { describe, expect, it } from "vitest";
import { friendlyRedirect } from "./domains.js";

const GAMES = ["greed", "blackjack", "slots"];
const HOME = "https://casino.horizons.gg";

describe("a game's own subdomain", () => {
  it("sends the bare subdomain to that game", () => {
    expect(friendlyRedirect("greed.horizons.gg", "/", GAMES, HOME)).toBe(
      "https://casino.horizons.gg/greed",
    );
    expect(friendlyRedirect("blackjack.horizons.gg", "/", GAMES, HOME)).toBe(
      "https://casino.horizons.gg/blackjack",
    );
  });

  it("keeps the path when there already is one", () => {
    // A shared table code, which resolves to its own game once it lands.
    expect(friendlyRedirect("greed.horizons.gg", "/X7KQ3", GAMES, HOME)).toBe(
      "https://casino.horizons.gg/X7KQ3",
    );
    expect(friendlyRedirect("greed.horizons.gg", "/me", GAMES, HOME)).toBe(
      "https://casino.horizons.gg/me",
    );
  });

  it("leaves every other host alone", () => {
    expect(friendlyRedirect("casino.horizons.gg", "/", GAMES, HOME)).toBeNull();
    expect(friendlyRedirect("localhost", "/", GAMES, HOME)).toBeNull();
    expect(friendlyRedirect("poker.horizons.gg", "/", GAMES, HOME)).toBeNull();
  });

  it("never moves what the browser asks for on its own behalf", () => {
    // Redirecting these would break the socket handshake and the sign-in
    // round-trip for anybody who reached the subdomain before the redirect.
    for (const path of ["/api/me", "/auth/discord", "/socket.io/", "/healthz"]) {
      expect(friendlyRedirect("greed.horizons.gg", path, GAMES, HOME)).toBeNull();
    }
    // But a path that merely starts with those letters is a client route.
    expect(friendlyRedirect("greed.horizons.gg", "/apiary", GAMES, HOME)).toBe(
      "https://casino.horizons.gg/apiary",
    );
  });

  it("refuses to send a host to itself", () => {
    // Otherwise CLIENT_ORIGIN pointed at the subdomain is an endless loop
    // rather than a misconfiguration somebody can see and fix.
    expect(friendlyRedirect("greed.horizons.gg", "/", GAMES, "https://greed.horizons.gg")).toBeNull();
    expect(friendlyRedirect("GREED.horizons.gg", "/", GAMES, "https://greed.horizons.gg")).toBeNull();
  });

  it("does nothing without a canonical origin to send anybody to", () => {
    expect(friendlyRedirect("greed.horizons.gg", "/", GAMES, "")).toBeNull();
    expect(friendlyRedirect("greed.horizons.gg", "/", GAMES, "not a url")).toBeNull();
  });
});
