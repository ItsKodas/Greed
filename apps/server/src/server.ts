import { randomInt } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameAdapter, GameDeps, PlayTable, SeatIdentity } from "@greed/core";
import { Catalogue } from "@greed/core";
import type { Store } from "@greed/economy";
import { judgeDaily, MemoryStore } from "@greed/economy";
import { BLACKJACK, blackjackAdapter } from "@greed/game-blackjack";
import { GREED, RoomError, greedAdapter } from "@greed/game-greed";
import type { Die } from "@greed/rules";

import type { Ack, ClientToServer, ServerToClient } from "@greed/shared";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
// From the subpath, not the barrel: the client imports the barrel, and pulling
// zod in through it would ship a validation library to every browser.
import {
  actionSchema,
  addBotSchema,
  chatSchema,
  createSchema,
  joinSchema,
  mintCodeSchema,
  removeSeatSchema,
  resumeSchema,
  setBuyInSchema,
  setRulesSchema,
  watchSchema,
} from "@greed/shared/schemas";
import express from "express";
import session from "express-session";
import type { DefaultEventsMap } from "socket.io";
import { Server } from "socket.io";
import { readAdmins } from "./admin.js";
import type { AuthConfig } from "./auth.js";
import { mountAuth, readAuthConfig } from "./auth.js";

/**
 * What the room offers. One entry today; the point of the list is that adding
 * the second one is an entry rather than a change to the server.
 */
const CATALOGUE = new Catalogue()
  .add(GREED)
  .add({
    id: "blackjack",
    name: "Blackjack",
    blurb: "Beat the dealer to twenty-one.",
    shape: "table",
    minSeats: 1,
    maxSeats: 6,
    open: false,
  })
  .add({
    id: "slots",
    name: "Slots",
    blurb: "One player, one lever.",
    shape: "machine",
    minSeats: 1,
    maxSeats: 1,
    open: false,
  });


export interface GreedServerOptions {
  /** Injected so tests can roll deterministically. */
  roll?: (count: number) => Die[];
  /** How long the busting dice stay on screen before play moves on. */
  farklePauseMs?: number;
  /** How long a dropped player keeps their seat. */
  reconnectGraceMs?: number;
  /** How long an abandoned table survives. */
  emptyRoomTtlMs?: number;
  /** Where the browser client is served from, for CORS. */
  clientOrigin?: string;
  /** Off in tests: there is no built client to serve. */
  serveClient?: boolean;
  /** Range of the bot's fake thinking time. Tests set this to nearly nothing. */
  botDelayMs?: number | null;
  /** Where profiles and chips live. Defaults to memory, which is a real mode. */
  store?: Store;
  /** Null disables sign-in; the game still runs and guests still play. */
  auth?: AuthConfig | null;
  sessionSecret?: string;
  /** Session store, when something better than memory is available. */
  sessionStore?: session.Store;
  /**
   * Who a socket belongs to. Defaults to the session cookie; tests override
   * it because a real identity would otherwise need a Discord round-trip.
   */
  identify?: (socket: { id: string; request: unknown }) => string | null;
  /**
   * Who a request belongs to. Defaults to the session cookie.
   *
   * The mirror of `identify` for the HTTP routes. Both exist so tests can say
   * who is asking without standing up a real sign-in, and neither is reachable
   * from a request — they are arguments to the constructor, so nothing a
   * client sends can choose one.
   */
  identifyRequest?: (request: { session?: { userId?: string } }) => string | null;
}

/**
 * What we hang off a socket: the display name its account owns, resolved once
 * at connection. Null for a guest, who has no account to be checked against.
 */
interface SocketIdentity {
  /** Null for a guest, who has no account to be checked against. */
  identity: SeatIdentity | null;
  name: string | null;
}

/** A table, and the game being played at it. */
interface Seated {
  game: GameAdapter<PlayTable>;
  table: PlayTable;
}

export interface GreedServer {
  http: HttpServer;
  store: Store;
  io: Server<ClientToServer, ServerToClient>;
  /** Tables currently in memory. Exposed for tests and the health check. */
  rooms: Map<string, Seated>;
  close: () => Promise<void>;
}

const BOT_NAMES = ["Skint Alice", "Pockets", "Old Ned", "Bess", "Cutter", "Tumble", "Ivy"];

/** A socket may send this many events in this window before being ignored. */
const RATE_EVENTS = 60;
/*
 * Guessing a code is the only attack in the product that pays, and ten
 * characters of a thirty-letter alphabet is roughly 5.9 x 10^14 of them — so
 * this is not the thing standing between an attacker and free chips. What it
 * does is make the attempt cost an account and a wait, which is enough when
 * the search space is that size.
 */
const REDEEM_TRIES = 10;
const REDEEM_WINDOW_MS = 60_000;
const RATE_WINDOW_MS = 2000;
/** Chat is throttled harder, because it is the only thing others must read. */
const CHAT_EVENTS = 5;
const CHAT_WINDOW_MS = 5000;

interface Budget {
  count: number;
  resetAt: number;
}

export function createGreedServer(options: GreedServerOptions = {}): GreedServer {
  const {
    roll = defaultRoll,
    farklePauseMs = 2200,
    reconnectGraceMs = 90_000,
    emptyRoomTtlMs = 5 * 60 * 1000,
    clientOrigin = "http://localhost:5173",
    serveClient = true,
    botDelayMs = null,
    store = new MemoryStore(),
    auth = readAuthConfig(process.env),
    sessionSecret = resolveSessionSecret(process.env["SESSION_SECRET"]),
    sessionStore,
    identify,
    identifyRequest,
  } = options;

  /**
   * Open tables, each with the game it is being played under.
   *
   * The pair rather than the table alone: the socket layer knows how to seat
   * people and pass messages, and has to ask the game for everything else.
   */
  const rooms = new Map<string, Seated>();
  /**
   * Which table each socket is at, and as whom. A null seat is someone
   * watching: at the table, in the room, sent every state, holding nothing.
   */
  const sockets = new Map<string, { code: string; seatId: string | null }>();
  const turnClocks = new Map<string, NodeJS.Timeout>();
  const farklePauses = new Map<string, NodeJS.Timeout>();
  const botMoves = new Map<string, NodeJS.Timeout>();
  const budgets = new Map<string, Budget>();
  /* Keyed by account, not by socket: a socket is free to make more of. */
  const redeemBudgets = new Map<string, Budget>();
  /** Tables already paid out, so a re-broadcast cannot pay twice. */
  const settled = new Set<string>();
  const chatBudgets = new Map<string, Budget>();
  /** Every timer we own, so close() can leave no handle behind. */
  const pending = new Set<NodeJS.Timeout>();

  function later(run: () => void, ms: number): NodeJS.Timeout {
    const handle = setTimeout(() => {
      pending.delete(handle);
      run();
    }, ms);
    pending.add(handle);
    return handle;
  }

  const app = express();
  /*
   * Nothing posted here is large — a code, a stake, a note — so the limit is
   * small on purpose. Without this, request.body is undefined and every POST
   * silently behaves as though it were sent empty.
   */
  app.use(express.json({ limit: "8kb" }));

  const trustProxy = resolveTrustProxy(process.env["TRUST_PROXY"]);
  if (trustProxy !== null) {
    app.set("trust proxy", trustProxy);
  }
  const http = createHttpServer(app);
  const io = new Server<ClientToServer, ServerToClient, DefaultEventsMap, SocketIdentity>(http, {
    cors: { origin: clientOrigin, methods: ["GET", "POST"] },
  });

  const sessions = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  });
  app.use(sessions);
  // The socket handshake carries the same cookie, so a connection knows who it
  // belongs to without the client asserting anything.
  io.engine.use(sessions);

  mountAuth(app, store, auth);

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true, rooms: rooms.size, store: store.kind, signin: auth !== null });
  });

  app.get("/api/me", (request, response) => {
    void (async () => {
      const id = userIdOfRequest(request);
      const profile = id === undefined ? null : await store.get(id);
      response.json(
        profile === null
          ? { signedIn: false, signinAvailable: auth !== null }
          : {
              signedIn: true,
              signinAvailable: auth !== null,
              profile,
              /*
               * Whether the top-up would actually do anything. Answered here
               * rather than worked out in the browser, so the rule for who is
               * owed chips lives in exactly one place — offering a button that
               * can only say "you have plenty already" is not an offer.
               */
              dailyDue: judgeDaily(profile, Date.now()).ok,
            },
      );
    })();
  });

  app.post("/auth/logout", (request, response) => {
    request.session.destroy(() => response.json({ ok: true }));
  });

  app.post("/api/daily", (request, response) => {
    void (async () => {
      const id = userIdOfRequest(request);
      if (id === undefined) {
        response.status(401).json({ error: "Sign in first." });
        return;
      }
      response.json(await store.claimDaily(id));
    })();
  });

  /**
   * What is on offer, and how busy it is.
   *
   * The room picker needs to show a table with people at it differently from
   * an empty one, and that is a question about tables rather than about any
   * game — so it is answered here rather than by each game separately.
   */
  app.get("/api/room", (_request, response) => {
    // Every open table is a Greed table today. When there are two games, a
    // table will carry its game's id and this counts by that instead.
    const live = [...rooms.values()];
    response.json({
      games: CATALOGUE.all().map((game) => {
        const mine = game.id === GREED.id ? live : [];
        return {
          ...game,
          tables: mine.length,
          seated: mine.reduce((total, room) => total + room.table.seats.length, 0),
          watching: mine.reduce((total, room) => total + seatsWatching(room.table), 0),
        };
      }),
    });
  });

  /**
   * Which game a table belongs to.
   *
   * Codes are unique across the whole room, so a shared link never has to name
   * a game — this is what turns one back into an address. Answers for any
   * table that exists, signed in or not, because the point of a code is that
   * you can follow it before you have decided anything.
   */
  app.get("/api/table/:code", (request, response) => {
    const code = String(request.params["code"] ?? "").toUpperCase();
    if (!rooms.has(code)) {
      response.status(404).json({ error: "No table with that code." });
      return;
    }
    // Every table is a Greed table today; when there are two, the table says.
    response.json({ code, game: GREED.id });
  });

  /**
   * What a game is handed when it needs to move money.
   *
   * The only way a game touches a balance. It cannot reach the store, so it
   * cannot invent a way to pay somebody that the economy has not agreed to —
   * every route to a player's chips goes through these four.
   */
  const deps: GameDeps = {
    take: async (userId, amount) => (amount <= 0 ? true : store.adjustChips(userId, -amount)),
    give: async (userId, amount) => {
      if (amount > 0) {
        await store.adjustChips(userId, amount);
      }
    },
    record: (userId, bump) => store.bumpStats(userId, bump),
    finished: (record) => store.recordGame(record),
  };

  /** Every game this server can host, by id. */
  const ADAPTERS = new Map<string, GameAdapter<PlayTable>>([
    [GREED.id, greedAdapter({ roll }) as GameAdapter<PlayTable>],
    [BLACKJACK.id, blackjackAdapter() as GameAdapter<PlayTable>],
  ]);

  /** How many people are stood around a table, whatever the game calls it. */
  function seatsWatching(table: PlayTable): number {
    return (table.view(null) as { watching?: number }).watching ?? 0;
  }

  const admins = readAdmins(process.env);

  /** The id behind a request, however this server has been told to find it. */
  function userIdOfRequest(request: express.Request): string | undefined {
    if (identifyRequest !== undefined) {
      return identifyRequest(request) ?? undefined;
    }
    return request.session.userId;
  }

  /** The signed-in player, or null. Used by everything below. */
  async function whoIs(request: express.Request) {
    const id = userIdOfRequest(request);
    return id === undefined ? null : await store.get(id);
  }

  /**
   * Redeeming a code.
   *
   * The one endpoint in the product where guessing pays, so it is the one that
   * is rate limited by account rather than by socket: a socket is free to make
   * more of, and an account is not.
   */
  app.post("/api/redeem", (request, response) => {
    void (async () => {
      const profile = await whoIs(request);
      if (profile === null) {
        response.status(401).json({ ok: false, reason: "sign-in" });
        return;
      }
      if (!withinBudget(redeemBudgets, profile.id, REDEEM_TRIES, REDEEM_WINDOW_MS)) {
        response.status(429).json({ ok: false, reason: "too-many" });
        return;
      }
      const typed = String((request.body as { code?: unknown } | undefined)?.code ?? "");
      if (typed.trim().length === 0) {
        response.status(400).json({ ok: false, reason: "unknown-code" });
        return;
      }
      response.json(await store.redeem(typed, profile.id));
    })();
  });

  /** Everything below this needs to be on the list. */
  const requireAdmin: express.RequestHandler = (request, response, next) => {
    void (async () => {
      const profile = await whoIs(request);
      if (profile === null || !admins.has(profile.discordId)) {
        // Deliberately the same answer either way: whether a page exists is
        // not something an unauthorised visitor needs to learn.
        response.status(404).json({ error: "Not found." });
        return;
      }
      next();
    })();
  };

  app.get("/api/admin/codes", requireAdmin, (_request, response) => {
    void (async () => {
      response.json({ codes: await store.listCodes(50) });
    })();
  });

  app.post("/api/admin/codes", requireAdmin, (request, response) => {
    void (async () => {
      const parsed = mintCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "That is not a code worth minting." });
        return;
      }
      const profile = await whoIs(request);
      const code = await store.mintCode({
        chips: parsed.data.chips,
        maxRedemptions: parsed.data.maxRedemptions ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        note: parsed.data.note ?? "",
        createdBy: profile?.id ?? "unknown",
      });
      response.json({ code });
    })();
  });

  app.post("/api/admin/codes/:code/revoke", requireAdmin, (request, response) => {
    void (async () => {
      const done = await store.revokeCode(String(request.params["code"] ?? ""));
      response.status(done ? 200 : 404).json({ revoked: done });
    })();
  });

  app.get("/api/games", (request, response) => {
    void (async () => {
      const id = userIdOfRequest(request);
      if (id === undefined) {
        response.status(401).json({ error: "Sign in first." });
        return;
      }
      response.json({ games: await store.recentGames(id, 20) });
    })();
  });

  if (serveClient) {
    const here = dirname(fileURLToPath(import.meta.url));
    const clientDist = join(here, "../../web/dist");
    app.use(express.static(clientDist));
    /**
     * Anything that is not a file and not an API path is a client route — a
     * table code, say — so hand back the app and let the router sort it out.
     * Without this a shared link like /6PMKG would 404 in production, even
     * though it works in dev where Vite does the same thing for us.
     */
    app.get(/^(?!\/(?:healthz|auth|api|socket\.io)\b).*/, (_request, response) => {
      response.sendFile(join(clientDist, "index.html"), (error) => {
        if (error != null) {
          response.status(404).end();
        }
      });
    });
  }

  function makeCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = "";
      for (let index = 0; index < CODE_LENGTH; index += 1) {
        code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
      }
      if (!rooms.has(code)) {
        return code;
      }
    }
    throw new Error("could not find a free room code");
  }

  function botName(table: PlayTable): string {
    const taken = new Set(table.seats.map((seat) => seat.name));
    return BOT_NAMES.find((name) => !taken.has(name)) ?? `Bot ${table.seats.length + 1}`;
  }

  /** True while this socket is inside its allowance. */
  function withinBudget(store: Map<string, Budget>, id: string, max: number, window: number): boolean {
    const now = Date.now();
    const budget = store.get(id);
    if (budget === undefined || now > budget.resetAt) {
      store.set(id, { count: 1, resetAt: now + window });
      return true;
    }
    budget.count += 1;
    return budget.count <= max;
  }

  /**
   * Starts or clears the countdown on whoever is to act.
   *
   * The server does not know what a turn is; it asks the game whether one is
   * running out and when. A game with no clock simply never answers.
   */
  function armClock(code: string, seated: Seated): void {
    const existing = turnClocks.get(code);
    if (existing !== undefined) {
      clearTimeout(existing);
      turnClocks.delete(code);
    }

    const clock = seated.game.clock?.(seated.table) ?? null;
    // No clock while nobody is watching, or on a bot: a bot moves in a second
    // and cannot stall the table.
    const seat = clock === null ? undefined : seated.table.seats.find((s) => s.id === clock.seatId);
    if (clock === null || seated.table.isEmpty || seat?.isBot === true) {
      return;
    }

    turnClocks.set(
      code,
      later(() => {
        turnClocks.delete(code);
        const still = rooms.get(code);
        if (still === undefined) {
          return;
        }
        still.game.timeout?.(still.table, clock.seatId);
        broadcast(code);
      }, Math.max(0, clock.endsAt - Date.now())),
    );
  }


  /**
   * Sends the table to everyone at it, one at a time.
   *
   * Deliberately not `io.to(code).emit(...)`. That sends one description of the
   * table to every socket in the room, which is only safe while there is
   * nothing at the table that one seat may see and another may not. The moment
   * a card is face down, a single shared payload is not a rendering choice, it
   * is dealing everybody else your hand — and by then every game would be
   * written against the assumption that it cannot happen.
   *
   * Greed's view is the same for everyone, so today this sends identical
   * payloads and costs one small object per seat at a table of at most eight.
   */
  function sendState(code: string, table: PlayTable): void {
    const members = io.sockets.adapter.rooms.get(code);
    if (members === undefined) {
      return;
    }
    for (const socketId of members) {
      // Null while a socket is in the room but between seats — mid-resume, or
      // after its seat was taken away. It still gets the table, as nobody.
      const seat = sockets.get(socketId)?.seatId ?? null;
      io.to(socketId).emit("room:state", table.view(seat) as never);
    }
  }

  function broadcast(code: string): void {
    const seated = rooms.get(code);
    if (seated === undefined) {
      return;
    }
    armClock(code, seated);
    sendState(code, seated.table);
    schedulePause(code, seated);
    scheduleBot(code, seated);
    if (seated.game.isSettled(seated.table) && !settled.has(code)) {
      settled.add(code);
      void seated.game
        .settle(seated.table, deps)
        .catch((error) => console.error("settling failed", error));
    }
  }


  /**
   * Leaves the busting dice on screen for a beat, then moves play on.
   *
   * This lives here rather than in the roll handler because a bot never goes
   * through a socket handler — it calls the room directly. Scheduling it there
   * meant a bot that farkled froze the table for good.
   */
  function schedulePause(code: string, seated: Seated): void {
    if (farklePauses.has(code)) {
      return;
    }
    const pause = seated.game.pause?.(seated.table) ?? null;
    if (pause === null) {
      return;
    }
    farklePauses.set(
      code,
      later(() => {
        farklePauses.delete(code);
        const still = rooms.get(code);
        // Checked again on the way out: whatever wanted the pause may have
        // been resolved by somebody else while it was running.
        if (still === undefined || still.game.pause?.(still.table) == null) {
          return;
        }
        pause.run();
        broadcast(code);
      }, farklePauseMs),
    );
  }


  /**
   * Books the active bot's next move.
   *
   * The bot goes through the very same Room methods a socket handler calls, so
   * there is no privileged path for it to cheat down and nothing to keep in
   * sync with the human rules.
   */
  function scheduleBot(code: string, seated: Seated): void {
    const pending = botMoves.get(code);
    if (pending !== undefined) {
      clearTimeout(pending);
      botMoves.delete(code);
    }

    const move = seated.game.botMove?.(seated.table) ?? null;
    if (move === null) {
      return;
    }

    botMoves.set(
      code,
      later(() => {
        botMoves.delete(code);
        const still = rooms.get(code);
        if (still === undefined) {
          return;
        }
        // Asked again rather than trusting the one booked earlier: the table
        // may have moved on while the bot was thinking.
        const now = still.game.botMove?.(still.table) ?? null;
        if (now === null || now.seatId !== move.seatId) {
          return;
        }
        try {
          now.play();
        } catch (error) {
          console.error("a bot could not move", error);
        }
        broadcast(code);
      }, botDelayMs ?? move.delayMs),
    );
  }


  /** Clears a table once nobody has been sitting at it for a while. */
  function reapWhenEmpty(code: string): void {
    const room = rooms.get(code);
    if (room === undefined || !room.table.isEmpty) {
      return;
    }
    later(() => {
      const still = rooms.get(code);
      if (still?.table.isEmpty === true) {
        turnClocks.delete(code);
        farklePauses.delete(code);
        botMoves.delete(code);
        rooms.delete(code);
      }
    }, emptyRoomTtlMs);
  }

  /** Runs a seated action, turning a RoomError into a message not a crash. */
  /**
   * Runs something on a table on behalf of a socket, or explains why not.
   *
   * Everything a player can do goes through here: the rate limit, the check
   * that they hold a seat, the refusal, and the broadcast afterwards. A game
   * that wanted its own path around it would be a game that could not be
   * trusted with the same rules as the others.
   */
  function guard(
    socketId: string,
    run: (seated: Seated, seatId: string) => void | Promise<void>,
  ): void {
    const seat = sockets.get(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (seat === undefined || socket === undefined) {
      return;
    }
    if (!withinBudget(budgets, socketId, RATE_EVENTS, RATE_WINDOW_MS)) {
      socket.emit("room:error", "Slow down.");
      return;
    }
    const seated = rooms.get(seat.code);
    if (seated === undefined) {
      socket.emit("room:error", "That table is gone.");
      return;
    }
    if (seat.seatId === null) {
      socket.emit("room:error", "You are watching this table, not playing at it.");
      return;
    }
    void (async () => {
      try {
        await run(seated, seat.seatId as string);
        broadcast(seat.code);
      } catch (error) {
        /*
         * Only a refusal is shown to the player. Anything else is a bug, and a
         * bug reported as though it were a rule leaves nothing in the log to
         * find it by — which is exactly how it hides.
         */
        if (error instanceof RoomError) {
          socket.emit("room:error", error.message);
          return;
        }
        console.error("unexpected error handling an action", error);
        socket.emit("room:error", "Something went wrong.");
      }
    })();
  }


  /** The signed-in profile behind a socket, or null for a guest. */
  function userIdOf(socket: { id: string; request: unknown }): string | null {
    if (identify !== undefined) {
      return identify(socket);
    }
    const request = socket.request as { session?: { userId?: string } };
    return request.session?.userId ?? null;
  }

  /**
   * The name a socket sits under.
   *
   * A signed-in player gets the name on their profile, whatever they sent —
   * their seat, the chat and the game history all have to agree with the
   * account the chips come out of, and the client is in no position to promise
   * that. Guests have no profile to check against, so their own name stands.
   */
  function seatNameFor(socket: { data: SocketIdentity }, sent: string): string {
    return socket.data.name ?? sent;
  }



  // Middleware, not the connection handler, because it settles before the
  // client's first message is delivered. Resolving the name inside `connection`
  // would leave a window where an early lobby:create still used a typed one.
  io.use((socket, next) => {
    const userId = userIdOf(socket);
    if (userId === null) {
      socket.data.identity = null;
      socket.data.name = null;
      next();
      return;
    }
    void store
      .get(userId)
      .then((profile) => {
        socket.data.name = profile?.name ?? null;
        socket.data.identity = {
          userId,
          avatar: profile?.avatar ?? null,
          accentColor: profile?.accentColor ?? null,
        };
        next();
      })
      .catch(() => {
        // A store that will not answer should not keep someone out. They sit
        // down under the name they sent, as a guest would — but still as
        // themselves, so a game they finish still pays the right account.
        socket.data.name = null;
        socket.data.identity = { userId, avatar: null, accentColor: null };
        next();
      });
  });

  io.on("connection", (socket) => {
    socket.on("lobby:create", (payload, ack) => {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, error: "Pick a name first." });
        return;
      }
      try {
        const game = ADAPTERS.get(parsed.data.game ?? GREED.id);
        if (game === undefined) {
          ack({ ok: false, error: "No such game." });
          return;
        }
        const code = makeCode();
        const table = game.create(code, { ruleset: parsed.data.ruleset });
        rooms.set(code, { game, table });
        table.join(socket.id, seatNameFor(socket, parsed.data.name), socket.data.identity);
        sockets.set(socket.id, { code, seatId: socket.id });
        void socket.join(code);
        ack({ ok: true, code, seatId: socket.id });
        broadcast(code);
      } catch (error) {
        ack(fail(error, "Could not open a table."));
      }
    });

    socket.on("lobby:join", (payload, ack) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, error: "That is not a table code." });
        return;
      }
      const room = rooms.get(parsed.data.code);
      if (room === undefined) {
        ack({ ok: false, error: "No table with that code." });
        return;
      }
      try {
        room.table.join(socket.id, seatNameFor(socket, parsed.data.name), socket.data.identity);
        sockets.set(socket.id, { code: parsed.data.code, seatId: socket.id });
        void socket.join(parsed.data.code);
        ack({ ok: true, code: parsed.data.code, seatId: socket.id });
        broadcast(parsed.data.code);
      } catch (error) {
        ack(fail(error, "Could not sit down."));
      }
    });

    socket.on("lobby:resume", (payload, ack) => {
      const parsed = resumeSchema.safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, error: "That table is gone." });
        return;
      }
      const room = rooms.get(parsed.data.code);
      if (room === undefined) {
        ack({ ok: false, error: "That table is gone." });
        return;
      }
      try {
        room.table.reconnect(parsed.data.seatId);
        sockets.set(socket.id, { code: room.table.code, seatId: parsed.data.seatId });
        void socket.join(room.table.code);
        ack({ ok: true, code: room.table.code, seatId: parsed.data.seatId });
        broadcast(room.table.code);
      } catch (error) {
        ack(fail(error, "Could not rejoin."));
      }
    });

    socket.on("lobby:watch", (payload, ack) => {
      const parsed = watchSchema.safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, error: "That is not a table code." });
        return;
      }
      const room = rooms.get(parsed.data.code);
      if (room === undefined) {
        ack({ ok: false, error: "No table with that code." });
        return;
      }
      room.table.watch(socket.id);
      sockets.set(socket.id, { code: parsed.data.code, seatId: null });
      void socket.join(parsed.data.code);
      ack({ ok: true, code: parsed.data.code, seatId: "" });
      broadcast(parsed.data.code);
    });

    socket.on("lobby:leave", () => {
      const seat = sockets.get(socket.id);
      if (seat === undefined) {
        return;
      }
      sockets.delete(socket.id);
      void socket.leave(seat.code);
      const room = rooms.get(seat.code);
      if (room === undefined) {
        return;
      }
      if (seat.seatId === null) {
        room.table.unwatch(socket.id);
        broadcast(seat.code);
        reapWhenEmpty(seat.code);
        return;
      }
      // Deliberate, so the seat goes now rather than being held for a
      // reconnection that is not coming.
      if (room.table.status === "lobby") {
        room.table.removeSeat(seat.seatId);
      } else {
        room.table.disconnect(seat.seatId);
      }
      broadcast(seat.code);
      reapWhenEmpty(seat.code);
    });

    socket.on("lobby:addBot", (payload) => {
      const parsed = addBotSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (seated, seatId) => {
        requireHost(seated.table, seatId, "add players");
        const table = seated.table as { addBot?: (id: string, name: string, skill: string) => void };
        if (table.addBot === undefined) {
          throw new RoomError("This game has no bots.");
        }
        table.addBot(`bot:${randomInt(1, 1_000_000)}`, botName(seated.table), parsed.data.skill);
      });
    });

    socket.on("lobby:removeSeat", (payload) => {
      const parsed = removeSeatSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (seated, seatId) => {
        requireHost(seated.table, seatId, "remove players");
        seated.table.removeSeat(parsed.data.seatId);
      });
    });

    socket.on("lobby:setRules", (payload) => {
      const parsed = setRulesSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (seated, seatId) => {
        requireHost(seated.table, seatId, "change the rules");
        // A lobby option belongs to whichever game defines it; a game without
        // one simply does not answer to this.
        const table = seated.table as { updateRules?: (changes: unknown) => void };
        if (table.updateRules === undefined) {
          throw new RoomError("This game has no rules to change.");
        }
        table.updateRules(parsed.data);
      });
    });

    socket.on("lobby:setBuyIn", (payload) => {
      const parsed = setBuyInSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (seated, seatId) => {
        requireHost(seated.table, seatId, "set the stake");
        const table = seated.table as { setBuyIn?: (amount: number) => void };
        if (table.setBuyIn === undefined) {
          throw new RoomError("This game does not have a table stake.");
        }
        table.setBuyIn(parsed.data.amount);
      });
    });

    /**
     * Everything a player does at a table, whatever the game.
     *
     * One event rather than a verb each. The server does not know what "hit"
     * or "bank" mean and has no business knowing — it checks that somebody may
     * act, hands the action to the game, and reports the refusal if there is
     * one. Adding a game adds no events here.
     */
    socket.on("game:action", (payload, ack) => {
      const parsed = actionSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.();
        return;
      }
      guard(socket.id, async (seated, seatId) => {
        await seated.game.act(seated.table, seatId, parsed.data, deps);
        // A table that has been dealt again must be allowed to settle again.
        if (!seated.game.isSettled(seated.table)) {
          settled.delete(seated.table.code);
        }
      });
      // Always acknowledged, refused or not: a client counting these needs to
      // know when its own optimistic picture can be dropped.
      ack?.();
    });

    socket.on("chat:send", (payload) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      const seat = sockets.get(socket.id);
      if (seat === undefined) {
        return;
      }
      if (!withinBudget(chatBudgets, socket.id, CHAT_EVENTS, CHAT_WINDOW_MS)) {
        socket.emit("room:error", "Easy on the chat.");
        return;
      }
      const seated = rooms.get(seat.code);
      const who = seated?.table.seats.find((candidate) => candidate.id === seat.seatId);
      if (seated === undefined || who === undefined) {
        return;
      }
      // Plain text only, and never rendered as markup on the other side.
      io.to(seat.code).emit("chat:message", {
        seatId: who.id,
        name: who.name,
        text: parsed.data.text,
        at: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      const seat = sockets.get(socket.id);
      sockets.delete(socket.id);
      budgets.delete(socket.id);
      chatBudgets.delete(socket.id);
      if (seat === undefined) {
        return;
      }
      const room = rooms.get(seat.code);
      if (room === undefined) {
        return;
      }
      if (seat.seatId === null) {
        room.table.unwatch(socket.id);
        broadcast(seat.code);
        reapWhenEmpty(seat.code);
        return;
      }
      // Captured, so the timer below is not re-reading a field that has since
      // been narrowed away by the watcher check above.
      const seatId = seat.seatId;
      room.table.disconnect(seatId);
      broadcast(seat.code);

      // Hold the seat long enough for a page refresh to reclaim it.
      later(() => {
        const still = rooms.get(seat.code);
        if (still === undefined) {
          return;
        }
        // Asked of the table rather than the view: every game has seats, and
        // not every game's view is shaped the same.
        const held = still.table.seats.find((candidate) => candidate.id === seatId);
        if (held?.connected === true) {
          return; // they came back
        }
        still.table.removeSeat(seatId);
        broadcast(seat.code);
      }, reconnectGraceMs);

      reapWhenEmpty(seat.code);
    });
  });

  async function close(): Promise<void> {
    for (const handle of pending) {
      clearTimeout(handle);
    }
    pending.clear();
    for (const store of [turnClocks, farklePauses, botMoves]) {
      for (const handle of store.values()) {
        clearTimeout(handle);
      }
      store.clear();
    }
    await io.close();
    await store.close();
    await new Promise<void>((resolve) => {
      http.close(() => resolve());
    });
  }

  return { http, io, rooms, store, close };
}

/**
 * How much of X-Forwarded-Proto to believe.
 *
 * Behind a proxy that terminates TLS — Cloudflare, nginx, a tunnel — Express
 * sees a plain http connection and only learns otherwise from that header.
 * Until it is told to trust the header it treats every request as insecure,
 * and express-session then declines to send a cookie marked `secure` at all:
 * no cookie, no session, and signing in silently does nothing.
 *
 * An empty string counts as unset. Compose writes `${VAR:-}` for anything
 * absent from .env, so in a container "not configured" arrives as "" rather
 * than as undefined, and a `??` here would look right and never fire.
 */
export function resolveTrustProxy(
  configured: string | undefined,
): number | boolean | string | null {
  const value = configured?.trim() ?? "";
  if (value.length === 0) {
    // One proxy in front is the ordinary deployment; nothing in development.
    return isProduction() ? 1 : null;
  }
  if (value === "true" || value === "false") {
    return value === "true";
  }
  const hops = Number(value);
  // Anything else is Express's own syntax: an address, a subnet, "loopback".
  return Number.isNaN(hops) ? value : hops;
}

/** Whether this is a real deployment rather than someone's laptop. */
function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * The key that signs session cookies, and therefore the thing standing between
 * a stranger and someone else's chips.
 *
 * There is a fixed development default so a local restart does not sign
 * everyone out mid-game, but that value is in a public repository, so anyone
 * could forge a cookie with it. In production a real secret is required and the
 * server refuses to start without one — failing loudly beats running with a
 * key the whole internet can read.
 */
export function resolveSessionSecret(provided: string | undefined): string {
  if (provided !== undefined && provided.length > 0) {
    return provided;
  }
  if (isProduction()) {
    throw new Error(
      "SESSION_SECRET must be set in production. Generate one with " +
        "`node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"` " +
        "and put it in .env — without it, session cookies would be signed with a " +
        "key published in this repository.",
    );
  }
  return "greed-development-secret";
}

function requireHost(table: PlayTable, seatId: string, what: string): void {
  if (seatId !== table.hostId) {
    throw new RoomError(`Only the host can ${what}.`);
  }
}

function fail(error: unknown, fallback: string): Ack {
  return { ok: false, error: error instanceof RoomError ? error.message : fallback };
}

/** The dice. Server-side, always — a client never generates a face. */
function defaultRoll(count: number): Die[] {
  const dice: Die[] = [];
  for (let index = 0; index < count; index += 1) {
    dice.push(randomInt(1, 7) as Die);
  }
  return dice;
}
