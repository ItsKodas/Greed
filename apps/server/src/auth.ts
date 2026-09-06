import { Discord, generateCodeVerifier, generateState, OAuth2RequestError } from "arctic";
import type { Express, RequestHandler } from "express";
import type { Store } from "./store.js";

/**
 * Sign in with Discord.
 *
 * Deliberately optional: with no client credentials configured the routes
 * answer 503 and the rest of the game carries on, because guests can play
 * without an account. Signing in is what buys a persistent profile and chips.
 */

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Where to send the browser once it is done. */
  clientUrl: string;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    oauthVerifier?: string;
  }
}

/**
 * Discord hands back an avatar hash, not a picture. Turning it into a URL here
 * rather than in the browser keeps the Discord account id off the wire, and
 * means everything downstream — the header, the seats — just has a `src`.
 *
 * Null for someone who never set a picture; they get their monogram instead,
 * which suits the table better than Discord's default blue circle.
 */
export function avatarUrl(user: { id: string; avatar?: string | null }): string | null {
  if (user.avatar === undefined || user.avatar === null || user.avatar.length === 0) {
    return null;
  }
  // An `a_` prefix marks an animated avatar, which is only animated as a gif.
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
}

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig | null {
  const clientId = env["DISCORD_CLIENT_ID"];
  const clientSecret = env["DISCORD_CLIENT_SECRET"];
  if (
    clientId === undefined ||
    clientSecret === undefined ||
    clientId.length === 0 ||
    clientSecret.length === 0
  ) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    redirectUri: env["DISCORD_REDIRECT_URI"] ?? "http://localhost:3001/auth/discord/callback",
    clientUrl: env["CLIENT_ORIGIN"] ?? "http://localhost:5173",
  };
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  accent_color?: number | null;
}

export function mountAuth(app: Express, store: Store, config: AuthConfig | null): void {
  if (config === null) {
    const unavailable: RequestHandler = (_request, response) => {
      response
        .status(503)
        .json({ error: "Discord sign-in is not configured on this server." });
    };
    app.get("/auth/discord", unavailable);
    app.get("/auth/discord/callback", unavailable);
    return;
  }

  const discord = new Discord(config.clientId, config.clientSecret, config.redirectUri);

  app.get("/auth/discord", (request, response) => {
    const state = generateState();
    const verifier = generateCodeVerifier();
    // Both bound to the session and single-use, so a callback cannot be
    // replayed, forged from another tab, or intercepted mid-flight.
    request.session.oauthState = state;
    request.session.oauthVerifier = verifier;
    const url = discord.createAuthorizationURL(state, verifier, ["identify"]);
    response.redirect(url.toString());
  });

  app.get("/auth/discord/callback", (request, response) => {
    void (async () => {
      const code = typeof request.query["code"] === "string" ? request.query["code"] : null;
      const state = typeof request.query["state"] === "string" ? request.query["state"] : null;
      const expected = request.session.oauthState;
      const verifier = request.session.oauthVerifier;
      delete request.session.oauthState;
      delete request.session.oauthVerifier;

      if (
        code === null ||
        state === null ||
        expected === undefined ||
        verifier === undefined ||
        state !== expected
      ) {
        response.redirect(`${config.clientUrl}/?signin=failed`);
        return;
      }

      try {
        const tokens = await discord.validateAuthorizationCode(code, verifier);
        const profileResponse = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${tokens.accessToken()}` },
        });
        if (!profileResponse.ok) {
          response.redirect(`${config.clientUrl}/?signin=failed`);
          return;
        }
        const discordUser = (await profileResponse.json()) as DiscordUser;
        const profile = await store.upsertDiscordUser({
          discordId: discordUser.id,
          name: discordUser.global_name ?? discordUser.username,
          avatar: avatarUrl(discordUser),
          accentColor: discordUser.accent_color ?? null,
        });
        request.session.userId = profile.id;
        response.redirect(`${config.clientUrl}/?signin=ok`);
      } catch (error) {
        if (!(error instanceof OAuth2RequestError)) {
          console.error("discord sign-in failed", error);
        }
        response.redirect(`${config.clientUrl}/?signin=failed`);
      }
    })();
  });
}
