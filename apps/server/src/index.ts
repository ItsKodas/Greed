import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { Server } from "socket.io";
import type { Die } from "@greed/rules";
import { DEFAULT_RULESET, RULESETS } from "@greed/rules";
import { CODE_ALPHABET, CODE_LENGTH } from "@greed/shared";
import type { ClientToServer, ServerToClient } from "@greed/shared";
import { comboGateKeyFor } from "./gatekey.js";
import { decide, thinkingTime } from "./bot.js";
import type { BotSkill } from "./bot.js";
import { Room, RoomError } from "./room.js";

/**
 * Port precedence: an explicit --port flag, then PORT, then 3001. The flag
 * matters in dev because the harness that launches both processes sets PORT
 * for the web server, and the API must not inherit it.
 */
const portFlag = process.argv.indexOf("--port");
const PORT = Number(
  portFlag !== -1 ? process.argv[portFlag + 1] : (process.env["PORT"] ?? 3001),
);
const CLIENT_ORIGIN = process.env["CLIENT_ORIGIN"] ?? "http://localhost:5173";

/** How long the busting dice stay on screen before play moves on. */
const FARKLE_PAUSE_MS = 2200;
/** Rooms with nobody connected are reaped after this long. */
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
/** How long a dropped player keeps their seat. A refresh must fit inside this. */
const RECONNECT_GRACE_MS = 90 * 1000;

const rooms = new Map<string, Room>();
/** One inactivity clock per room, re-armed on every state change. */
const turnClocks = new Map<string, NodeJS.Timeout>();
/** One pending bot move per room, so a bot can never queue two at once. */
const botMoves = new Map<string, NodeJS.Timeout>();
/** One pending farkle pause per room. */
const farklePauses = new Map<string, NodeJS.Timeout>();

const BOT_NAMES = ["Skint Alice", "Pockets", "Old Ned", "Bess", "Cutter", "Tumble", "Ivy"];

function botName(room: Room): string {
  const taken = new Set(room.seats.map((seat) => seat.name));
  const free = BOT_NAMES.find((name) => !taken.has(name));
  return free ?? `Bot ${room.seats.length + 1}`;
}
/** socket.id -> which room and seat it is sitting in. */
const sockets = new Map<string, { code: string; seatId: string }>();

/** The dice. Server-side, always — a client never generates a face. */
function rollDice(count: number): Die[] {
  const dice: Die[] = [];
  for (let index = 0; index < count; index += 1) {
    dice.push(randomInt(1, 7) as Die);
  }
  return dice;
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

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

app.get("/healthz", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

// In production the built client is served from the same origin.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, "../../web/dist");
app.use(express.static(clientDist));

/**
 * Anything that is not a file and not an API path is a client route — a table
 * code, say — so hand back the app and let the router sort it out. Without
 * this a shared link like /6PMKG would 404 on a real deployment, even though
 * it works in dev where Vite does the same thing for us.
 */
app.get(/^(?!\/(?:healthz|socket\.io)).*/, (_request, response) => {
  response.sendFile(join(clientDist, "index.html"), (error) => {
    if (error !== undefined && error !== null) {
      response.status(404).end();
    }
  });
});

/**
 * Re-arms the inactivity clock for a room.
 *
 * This is an inactivity timer, not a hard per-turn limit: any action by the
 * active player pushes it back. A player who is present and thinking is not
 * the problem it exists to solve — a player who has walked away is.
 */
function armClock(room: Room): void {
  const existing = turnClocks.get(room.code);
  if (existing !== undefined) {
    clearTimeout(existing);
    turnClocks.delete(room.code);
  }

  const seconds = room.ruleset.turnTimerSeconds;
  const view = room.view();
  // No clock while nobody is watching it.
  if (room.status !== "playing" || seconds === null || view.turn === null || room.isEmpty) {
    room.endsAt = null;
    return;
  }

  const seatId = view.turn.seatId;
  // No clock on a bot: it moves in a second or two and can never stall.
  const active = room.activeSeat();
  if (active?.isBot === true) {
    room.endsAt = null;
    return;
  }
  room.endsAt = Date.now() + seconds * 1000;
  turnClocks.set(
    room.code,
    setTimeout(() => {
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
}

/**
 * Leaves the busting dice on screen for a beat, then moves play on.
 *
 * This lives here rather than in the roll handler because a bot never goes
 * through a socket handler — it calls the room directly. Scheduling it there
 * meant a bot that farkled froze the table for good.
 */
/** Clears a table once nobody has been sitting at it for a while. */
function reapWhenEmpty(code: string): void {
  const room = rooms.get(code);
  if (room === undefined || !room.isEmpty) {
    return;
  }
  setTimeout(() => {
    const still = rooms.get(code);
    if (still !== undefined && still.isEmpty) {
      turnClocks.delete(code);
      farklePauses.delete(code);
      botMoves.delete(code);
      rooms.delete(code);
    }
  }, EMPTY_ROOM_TTL_MS);
}

function scheduleFarklePause(room: Room): void {
  const phase = room.view().turn?.phase;
  if (phase !== "farkled") {
    return;
  }
  if (farklePauses.has(room.code)) {
    return; // already counting down
  }
  farklePauses.set(
    room.code,
    setTimeout(() => {
      farklePauses.delete(room.code);
      const still = rooms.get(room.code);
      if (still === undefined || still.view().turn?.phase !== "farkled") {
        return;
      }
      still.advanceTurn();
      broadcast(room.code);
    }, FARKLE_PAUSE_MS),
  );
}

/**
 * Books the active bot's next move, if the active seat is one.
 *
 * The bot goes through the very same Room methods a socket handler calls, so
 * there is no privileged path for it to cheat down and nothing to keep in sync
 * with the human rules.
 */
function scheduleBot(room: Room): void {
  const pending = botMoves.get(room.code);
  if (pending !== undefined) {
    clearTimeout(pending);
    botMoves.delete(room.code);
  }

  const seat = room.activeSeat();
  if (seat === null || !seat.isBot || seat.skill === null) {
    return;
  }
  const view = room.view();
  if (view.turn === null || view.turn.phase === "farkled" || view.turn.phase === "over") {
    return; // the farkle pause will move play along
  }

  const skill = seat.skill;
  botMoves.set(
    room.code,
    setTimeout(() => {
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
    }, thinkingTime(skill)),
  );
}

/** One bot action: either the opening roll, or a keep-then-roll-or-bank. */
function playBotTurn(room: Room, seatId: string, skill: BotSkill): void {
  const view = room.view();
  const turn = view.turn;
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

/** Wraps a handler so RoomError becomes a message instead of a crash. */
function guard(socketId: string, run: (room: Room, seatId: string) => void): void {
  const seat = sockets.get(socketId);
  const socket = io.sockets.sockets.get(socketId);
  if (seat === undefined || socket === undefined) {
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

io.on("connection", (socket) => {
  socket.on("lobby:create", ({ name, ruleset }, ack) => {
    try {
      const chosen = RULESETS.find((candidate) => candidate.name === ruleset) ?? DEFAULT_RULESET;
      const code = makeCode();
      const room = new Room(code, rollDice, chosen);
      rooms.set(code, room);
      room.join(socket.id, name);
      sockets.set(socket.id, { code, seatId: socket.id });
      void socket.join(code);
      ack({ ok: true, code, seatId: socket.id });
      broadcast(code);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not open a table." });
    }
  });

  socket.on("lobby:join", ({ name, code }, ack) => {
    const normalized = String(code ?? "").trim().toUpperCase();
    const room = rooms.get(normalized);
    if (room === undefined) {
      ack({ ok: false, error: "No table with that code." });
      return;
    }
    try {
      room.join(socket.id, name);
      sockets.set(socket.id, { code: normalized, seatId: socket.id });
      void socket.join(normalized);
      ack({ ok: true, code: normalized, seatId: socket.id });
      broadcast(normalized);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not sit down." });
    }
  });

  socket.on("lobby:resume", ({ seatId, code }, ack) => {
    const room = rooms.get(String(code ?? "").trim().toUpperCase());
    if (room === undefined) {
      ack({ ok: false, error: "That table is gone." });
      return;
    }
    try {
      room.reconnect(seatId);
      sockets.set(socket.id, { code: room.code, seatId });
      void socket.join(room.code);
      ack({ ok: true, code: room.code, seatId });
      broadcast(room.code);
    } catch (error) {
      ack({ ok: false, error: error instanceof RoomError ? error.message : "Could not rejoin." });
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

  socket.on("lobby:addBot", ({ skill }) => {
    guard(socket.id, (room, seatId) => {
      if (seatId !== room.hostId) {
        throw new RoomError("Only the host can add players.");
      }
      const chosen: BotSkill = skill === "easy" || skill === "hard" ? skill : "normal";
      room.addBot(`bot:${randomInt(1, 1_000_000)}`, botName(room), chosen);
    });
  });

  socket.on("lobby:removeSeat", ({ seatId: target }) => {
    guard(socket.id, (room, seatId) => {
      if (seatId !== room.hostId) {
        throw new RoomError("Only the host can remove players.");
      }
      room.removeSeat(target);
    });
  });

  socket.on("game:start", () => {
    guard(socket.id, (room, seatId) => room.start(seatId));
  });

  socket.on("game:toggle", ({ index }) => {
    guard(socket.id, (room, seatId) => room.toggle(seatId, index));
  });

  socket.on("game:bank", () => {
    guard(socket.id, (room, seatId) => room.bank(seatId));
  });

  socket.on("game:roll", () => {
    // broadcast() handles the farkle pause, for humans and bots alike.
    guard(socket.id, (room, seatId) => room.doRoll(seatId));
  });

  socket.on("disconnect", () => {
    const seat = sockets.get(socket.id);
    sockets.delete(socket.id);
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
    setTimeout(() => {
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
    }, RECONNECT_GRACE_MS);

    reapWhenEmpty(seat.code);
  });
});

http.listen(PORT, () => {
  console.log(`greed server listening on http://localhost:${PORT}`);
});
