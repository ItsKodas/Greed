import { describe, expect, it } from "vitest";
import { avatarUrl, readAuthConfig, safeReturn } from "./auth.js";

describe("turning a Discord avatar into a picture", () => {
  it("builds a CDN url from the hash", () => {
    expect(avatarUrl({ id: "123", avatar: "abc" })).toBe(
      "https://cdn.discordapp.com/avatars/123/abc.png?size=128",
    );
  });

  it("asks for a gif when the avatar is animated", () => {
    // Discord marks animated avatars with an a_ prefix, and serves them as a
    // still png at any other extension.
    expect(avatarUrl({ id: "123", avatar: "a_abc" })).toContain(".gif");
  });

  it("has nothing to show for someone who never set one", () => {
    expect(avatarUrl({ id: "123", avatar: null })).toBeNull();
    expect(avatarUrl({ id: "123", avatar: "" })).toBeNull();
    expect(avatarUrl({ id: "123" })).toBeNull();
  });
});

describe("reading the auth configuration", () => {
  it("is absent without both halves of the credential", () => {
    expect(readAuthConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(readAuthConfig({ DISCORD_CLIENT_ID: "x" } as NodeJS.ProcessEnv)).toBeNull();
    expect(
      readAuthConfig({ DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "" } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("is present when both are set", () => {
    const config = readAuthConfig({
      DISCORD_CLIENT_ID: "x",
      DISCORD_CLIENT_SECRET: "y",
    } as NodeJS.ProcessEnv);
    expect(config?.clientId).toBe("x");
    expect(config?.redirectUri).toContain("/auth/discord/callback");
  });
});

describe("where somebody lands after signing in", () => {
  it("keeps a path on this site", () => {
    expect(safeReturn("/blackjack/XKQ37")).toBe("/blackjack/XKQ37");
    expect(safeReturn("/")).toBe("/");
    expect(safeReturn("/greed")).toBe("/greed");
    expect(safeReturn("/6PMKG")).toBe("/6PMKG");
  });

  it("refuses anything that could leave this site", () => {
    /*
     * The open-redirect boundary. Every one of these is a real technique for
     * turning a sign-in link into a link to somewhere else, and a browser
     * reads several of them as absolute however innocent they look.
     */
    for (const nasty of [
      "https://evil.example/steal",
      "//evil.example",
      "/\\evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "/path?next=https://evil.example",
      "/path#https://evil.example",
      "/pa th",
      "/%2f%2fevil.example",
      "",
      "blackjack/XKQ37",
    ]) {
      expect(safeReturn(nasty), nasty).toBeNull();
    }
  });

  it("refuses anything that is not a string, or is absurdly long", () => {
    expect(safeReturn(undefined)).toBeNull();
    expect(safeReturn(null)).toBeNull();
    expect(safeReturn(["/a", "/b"])).toBeNull();
    expect(safeReturn(`/${"a".repeat(200)}`)).toBeNull();
  });
});
