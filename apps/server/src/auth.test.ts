import { describe, expect, it } from "vitest";
import { avatarUrl, readAuthConfig } from "./auth.js";

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
