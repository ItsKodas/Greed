import { randomInt } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import { Server } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import { DEFAULT_RULESET, RULESETS } from "@greed/rules";
import type { Die } from "@greed/rules";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
// From the subpath, not the barrel: the client imports the barrel, and pulling
// zod in through it would ship a validation library to every browser.
import {
  addBotSchema,
  chatSchema,
  createSchema,
  joinSchema,
  removeSeatSchema,
  resumeSchema,
  setBuyInSchema,
  setRulesSchema,
  toggleSchema,
} from "@greed/shared/schemas";
import type { Ack, ClientToServer, ServerToClient } from "@greed/shared";
import { decide, thinkingTime } from "./bot.js";
import type { BotSkill } from "./bot.js";
import { comboGateKeyFor } from "./gatekey.js";
import { mountAuth, readAuthConfig } from "./auth.js";
import type { AuthConfig } from "./auth.js";
import { MemoryStore } from "./store.js";
import type { Store } from "./store.js";
import { Room, RoomError } from "./room.js";
import type { SeatIdentity } from "./room.js";

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

export interface GreedServer {
  http: HttpServer;
  store: Store;
  io: Server<ClientToServer, ServerToClient>;
  /** Rooms currently in memory. Exposed for tests and the health check. */
  rooms: Map<string, Room>;
  close: () => Promise<void>;
}

const BOT_NAMES = ["Skint Alice", "Pockets", "Old Ned", "Bess", "Cutter", "Tumble", "Ivy"];

/** A socket may send this many events in this window before being ignored. */
const RATE_EVENTS = 60;
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
  } = options;

  const rooms = new Map<string, Room>();
  const sockets = new Map<string, { code: string; seatId: string }>();
  const turnClocks = new Map<string, NodeJS.Timeout>();
  const farklePauses = new Map<string, NodeJS.Timeout>();
  const botMoves = new Map<string, NodeJS.Timeout>();
  const budgets = new Map<string, Budget>();
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
   * Behind a proxy that terminates TLS — Cloudflare, nginx, a tunnel — Express
   * sees a plain http connection and only learns otherwise from
   * X-Forwarded-Proto. Until it is told to believe that header it treats the
   * request as insecure and express-session declines to send a cookie marked
   * `secure` at all, so signing in appears to do nothing whatsoever.
   *
   * A number is a count of proxies to trust nearest-first. One suits a single
   * proxy in front; set TRUST_PROXY when there are more, or to a specific
   * address or subnet.
   */
  const trustProxy = process.env["TRUST_PROXY"] ?? (isProduction() ? "1" : "");
  if (trustProxy.length > 0) {
    const hops = Number(trustProxy);
    app.set("trust proxy", Number.isNaN(hops) ? trustProxy : hops);
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
      const id = request.session.userId;
      const profile = id === undefined ? null : await store.get(id);
      response.json(
        profile === null
          ? { signedIn: false, signinAvailable: auth !== null }
          : { signedIn: true, signinAvailable: auth !== null, profile },
      );
    })();
  });

  app.post("/auth/logout", (request, response) => {
    request.session.destroy(() => response.json({ ok: true }));
  });

  app.post("/api/daily", (request, response) => {
    void (async () => {
      const id = request.session.userId;
      if (id === undefined) {
        response.status(401).json({ error: "Sign in first." });
        return;
      }
      response.json(await store.claimDaily(id));
    })();
  });

  app.get("/api/games", (request, response) => {
    void (async () => {
      const id = request.session.userId;
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

  function botName(room: Room): string {
    const taken = new Set(room.seats.map((seat) => seat.name));
    return BOT_NAMES.find((name) => !taken.has(name)) ?? `Bot ${room.seats.length + 1}`;
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

  function armClock(room: Room): void {
    const existing = turnClocks.get(room.code);
    if (existing !== undefined) {
      clearTimeout(existing);
      turnClocks.delete(room.code);
    }

    const seconds = room.ruleset.turnTimerSeconds;
    const view = room.view();
    const active = room.activeSeat();
    // No clock before the game starts, once it is over, while nobody is
    // watching, or on a bot — a bot moves in a second and cannot stall.
    if (
      room.status !== "playing" ||
      seconds === null ||
      view.turn === null ||
      room.isEmpty ||
      active?.isBot === true
    ) {
      room.endsAt = null;
      return;
    }

    const seatId = view.turn.seatId;
    room.endsAt = Date.now() + seconds * 1000;
    turnClocks.set(
      room.code,
      later(() => {
        turnClocks.delete(room.code);
        const still = rooms.get(room.code);
        if (still === undefined) {
          return;
        }
        still.timeout(seatId);
        broadcast(room.code);
      }, seconds * 1000),
    );
  }

  function broadcast(code: string): void {
    const room = rooms.get(code);
    if (room === undefined) {
      return;
    }
    armClock(room);
    io.to(code).emit("room:state", room.view());
    scheduleFarklePause(room);
    scheduleBot(room);
    if (room.status === "over" && !settled.has(code)) {
      settled.add(code);
      void settle(room).catch((error) => console.error("settling failed", error));
    }
  }

  /**
   * Leaves the busting dice on screen for a beat, then moves play on.
   *
   * This lives here rather than in the roll handler because a bot never goes
   * through a socket handler — it calls the room directly. Scheduling it there
   * meant a bot that farkled froze the table for good.
   */
  function scheduleFarklePause(room: Room): void {
    if (room.view().turn?.phase !== "farkled" || farklePauses.has(room.code)) {
      return;
    }
    farklePauses.set(
      room.code,
      later(() => {
        farklePauses.delete(room.code);
        const still = rooms.get(room.code);
        if (still === undefined || still.view().turn?.phase !== "farkled") {
          return;
        }
        still.advanceTurn();
        broadcast(room.code);
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
  function scheduleBot(room: Room): void {
    const pendingMove = botMoves.get(room.code);
    if (pendingMove !== undefined) {
      clearTimeout(pendingMove);
      botMoves.delete(room.code);
    }

    const seat = room.activeSeat();
    if (seat === null || !seat.isBot || seat.skill === null) {
      return;
    }
    const phase = room.view().turn?.phase;
    if (phase === undefined || phase === "farkled" || phase === "over") {
      return;
    }

    const skill = seat.skill;
    const delay = botDelayMs ?? thinkingTime(skill);
    botMoves.set(
      room.code,
      later(() => {
        botMoves.delete(room.code);
        const still = rooms.get(room.code);
        if (still === undefined) {
          return;
        }
        try {
          playBotTurn(still, seat.id, skill);
        } catch (error) {
          console.error("bot move failed", error);
        }
        broadcast(room.code);
      }, delay),
    );
  }

  function playBotTurn(room: Room, seatId: string, skill: BotSkill): void {
    const turn = room.view().turn;
    if (turn === null || turn.seatId !== seatId) {
      return;
    }
    if (turn.phase === "awaiting_roll") {
      room.doRoll(seatId);
      return;
    }
    if (turn.phase !== "selecting") {
      return;
    }
    const seat = room.seats.find((candidate) => candidate.id === seatId);
    if (seat === undefined) {
      return;
    }

    const decision = decide({
      dice: turn.dice,
      kept: room.keptThisTurn,
      onBoard: seat.onBoard,
      mustBeat: room.deficitOnFinalTurn(),
      rules: room.ruleset,
      gateKey: comboGateKeyFor(room.ruleset),
      skill,
    });
    if (decision === null) {
      return;
    }
    for (const index of decision.keep) {
      room.toggle(seatId, index);
    }
    if (decision.action === "bank") {
      room.bank(seatId);
    } else {
      room.doRoll(seatId);
    }
  }

  /** Clears a table once nobody has been sitting at it for a while. */
  function reapWhenEmpty(code: string): void {
    const room = rooms.get(code);
    if (room === undefined || !room.isEmpty) {
      return;
    }
    later(() => {
      const still = rooms.get(code);
      if (still?.isEmpty === true) {
        turnClocks.delete(code);
        farklePauses.delete(code);
        botMoves.delete(code);
        rooms.delete(code);
      }
    }, emptyRoomTtlMs);
  }

  /** Runs a seated action, turning a RoomError into a message not a crash. */
  function guard(socketId: string, run: (room: Room, seatId: string) => void): void {
    const seat = sockets.get(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (seat === undefined || socket === undefined) {
      return;
    }
    if (!withinBudget(budgets, socketId, RATE_EVENTS, RATE_WINDOW_MS)) {
      socket.emit("room:error", "Slow down.");
      return;
    }
    const room = rooms.get(seat.code);
    if (room === undefined) {
      socket.emit("room:error", "That table is gone.");
      return;
    }
    try {
      run(room, seat.seatId);
      broadcast(seat.code);
    } catch (error) {
      if (error instanceof RoomError) {
        socket.emit("room:error", error.message);
        return;
      }
      console.error("unexpected error handling an action", error);
      socket.emit("room:error", "Something went wrong.");
    }
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

  /**
   * Settles a finished game: the pot goes to the winners, split evenly, with
   * any remainder to the earliest-seated of them. Recorded either way, so a
   * friendly game still shows up in a history.
   */
  async function settle(room: Room): Promise<void> {
    const winners = room.seats.filter((seat) => room.winnerIds.includes(seat.id));
    const share = winners.length > 0 ? Math.floor(room.pot / winners.length) : 0;
    const remainder = room.pot - share * winners.length;

    for (const [index, seat] of winners.entries()) {
      if (seat.userId === null) {
        continue;
      }
      const amount = share + (index === 0 ? remainder : 0);
      if (amount > 0) {
        await store.adjustChips(seat.userId, amount);
      }
    }

    for (const seat of room.seats) {
      if (seat.userId === null) {
        continue;
      }
      const won = room.winnerIds.includes(seat.id);
      await store.bumpStats(seat.userId, {
        games: 1,
        wins: won ? 1 : 0,
        chipsWon: won ? share - room.buyIn : -room.buyIn,
        bestTurn: seat.score,
      });
    }

    await store.recordGame({
      code: room.code,
      rulesetName: room.ruleset.name,
      buyIn: room.buyIn,
      pot: room.pot,
      players: room.seats.map((seat) => ({
        userId: seat.userId,
        name: seat.name,
        score: seat.score,
        isBot: seat.isBot,
      })),
      winnerIds: winners.map((seat) => seat.userId ?? seat.id),
      endedAt: Date.now(),
    });
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
        const chosen =
          RULESETS.find((candidate) => candidate.name === parsed.data.ruleset) ?? DEFAULT_RULESET;
        const code = makeCode();
        const room = new Room(code, roll, chosen);
        rooms.set(code, room);
        room.join(socket.id, seatNameFor(socket, parsed.data.name), socket.data.identity);
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
        room.join(socket.id, seatNameFor(socket, parsed.data.name), socket.data.identity);
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
        room.reconnect(parsed.data.seatId);
        sockets.set(socket.id, { code: room.code, seatId: parsed.data.seatId });
        void socket.join(room.code);
        ack({ ok: true, code: room.code, seatId: parsed.data.seatId });
        broadcast(room.code);
      } catch (error) {
        ack(fail(error, "Could not rejoin."));
      }
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
      // Deliberate, so the seat goes now rather than being held for a
      // reconnection that is not coming.
      if (room.status === "lobby") {
        room.removeSeat(seat.seatId);
      } else {
        room.disconnect(seat.seatId);
      }
      broadcast(seat.code);
      reapWhenEmpty(seat.code);
    });

    socket.on("lobby:addBot", (payload) => {
      const parsed = addBotSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (room, seatId) => {
        requireHost(room, seatId, "add players");
        room.addBot(`bot:${randomInt(1, 1_000_000)}`, botName(room), parsed.data.skill);
      });
    });

    socket.on("lobby:removeSeat", (payload) => {
      const parsed = removeSeatSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (room, seatId) => {
        requireHost(room, seatId, "remove players");
        room.removeSeat(parsed.data.seatId);
      });
    });

    socket.on("lobby:setRules", (payload) => {
      const parsed = setRulesSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (room, seatId) => {
        requireHost(room, seatId, "change the rules");
        room.updateRules(parsed.data);
      });
    });

    socket.on("lobby:setBuyIn", (payload) => {
      const parsed = setBuyInSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (room, seatId) => {
        requireHost(room, seatId, "set the stake");
        room.setBuyIn(parsed.data.amount);
      });
    });

    socket.on("game:start", () => {
      const seat = sockets.get(socket.id);
      const room = seat === undefined ? undefined : rooms.get(seat.code);
      if (seat === undefined || room === undefined) {
        return;
      }
      if (room.buyIn === 0) {
        guard(socket.id, (target, seatId) => target.start(seatId));
        return;
      }
      // Take every stake before dealing, and put back anything already taken
      // if one of them cannot pay. Nobody ends up half-way into a game.
      void (async () => {
        if (seat.seatId !== room.hostId) {
          socket.emit("room:error", "Only the host can start the game.");
          return;
        }
        const paid: string[] = [];
        for (const player of room.seats) {
          if (player.userId === null) {
            continue;
          }
          const ok = await store.adjustChips(player.userId, -room.buyIn);
          if (!ok) {
            for (const refund of paid) {
              await store.adjustChips(refund, room.buyIn);
            }
            socket.emit("room:error", `${player.name} cannot cover the buy-in.`);
            return;
          }
          paid.push(player.userId);
        }
        try {
          room.start(seat.seatId);
          broadcast(seat.code);
        } catch (error) {
          for (const refund of paid) {
            await store.adjustChips(refund, room.buyIn);
          }
          socket.emit("room:error", error instanceof RoomError ? error.message : "Could not start.");
        }
      })();
    });

    socket.on("game:roll", () => {
      guard(socket.id, (room, seatId) => room.doRoll(seatId));
    });

    socket.on("game:toggle", (payload) => {
      const parsed = toggleSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      guard(socket.id, (room, seatId) => room.toggle(seatId, parsed.data.index));
    });

    socket.on("game:bank", () => {
      guard(socket.id, (room, seatId) => room.bank(seatId));
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
      const room = rooms.get(seat.code);
      const who = room?.seats.find((candidate) => candidate.id === seat.seatId);
      if (room === undefined || who === undefined) {
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
      room.disconnect(seat.seatId);
      broadcast(seat.code);

      // Hold the seat long enough for a page refresh to reclaim it.
      later(() => {
        const still = rooms.get(seat.code);
        if (still === undefined) {
          return;
        }
        const held = still.view().seats.find((candidate) => candidate.id === seat.seatId);
        if (held?.connected === true) {
          return; // they came back
        }
        still.removeSeat(seat.seatId);
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

function requireHost(room: Room, seatId: string, what: string): void {
  if (seatId !== room.hostId) {
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
